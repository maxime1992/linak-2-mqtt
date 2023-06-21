require('dotenv').config();
const {
  Observable,
  tap,
  switchMap,
  filter,
  shareReplay,
  take,
  concatMap,
  withLatestFrom,
  Subject,
  map,
  timer,
  repeat,
} = require('rxjs');
const { spawn, exec } = require('child_process');
const YAML = require('yaml');
const fs = require('fs');

const linakConfigYamlFileContent = fs.readFileSync(
  './linak-config.yaml',
  'utf8'
);
const linakConfigYamlParsed = YAML.parse(linakConfigYamlFileContent);

const MQTT_HOST = process.env.MQTT_HOST;
const MQTTS_PORT = +process.env.MQTTS_PORT;
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

const mqtt = require('mqtt');
const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTTS_PORT}`, {
  protocolId: 'MQIsdp',
  protocolVersion: 3,
  username: MQTT_USER,
  password: MQTT_PASSWORD,
  rejectUnauthorized: false,
});

const mqttConnect$ = new Observable((observer) => {
  client.on('connect', () => {
    client.subscribe('linak-2-mqtt/set-desk-height');
    client.subscribe('linak-2-mqtt/toggle-desk-position');
  //  client.subscribe('linak-2-mqtt/last-update');
    client.subscribe('linak-2-mqtt/sitting-status');
    observer.next();
  });
}).pipe(shareReplay(1));

const connected$ = new Subject();

connected$
  .pipe(
    tap(() => {
      console.log('triggering watch..');
      spawn('idasen-controller', ['--forward', '--watch']);
    })
  )
  .subscribe();

const mqttDeskPositionMm$ = mqttConnect$.pipe(
  tap(() => console.log('[debug] Connected')),
  switchMap(() => startServer()),
  tap((x) => console.log(`returned`, x)),
  shareReplay(1)
);

const mqttDeskPositionCm$ = mqttDeskPositionMm$.pipe(
  map((deskPositionMm) => Math.round(deskPositionMm / 10)),
  shareReplay(1)
);


var last_updated=Math.floor(Date.now()/1000/60)
var need_update=0

var intervalId = setInterval(function() {
  //console.log("Interval reached every 15m")
  //console.log("last_updated: " + last_updated)

  var now = Math.floor(Date.now()/1000/60)
  //console.log("now "+ now)
  var difference = now-last_updated
  //console.log("Difference min:" + difference)


  if(difference > 60 ) {
	client.publish(
		`linak-2-mqtt/need-update`,
		'1'
	);
  }else{
	client.publish(
		`linak-2-mqtt/need-update`,
		'0'
	);
  }

}, 60000);//Check every minute;

var sitting_status = 'NA'
var tolerance = 5;
mqttDeskPositionCm$
  .pipe(
    tap((heightCm) => {
      console.log(`publishing updated height`, {
        absolute: heightCm,
        'process.env.DESK_LOWEST_HEIGHT_CM': +process.env.DESK_LOWEST_HEIGHT_CM,
        relative: heightCm - +process.env.DESK_LOWEST_HEIGHT_CM,
      });
      client.publish(
        `linak-2-mqtt/desk-absolute-height-updated`,
        heightCm.toString()
      );
      client.publish(
        `linak-2-mqtt/desk-relative-height-updated`,
        (heightCm - +process.env.DESK_LOWEST_HEIGHT_CM).toString()
      );

      //client.publish(
      // `linak-2-mqtt/last-update`,
      //  last_updated.toString()
      //);

      if(heightCm > linakConfigYamlParsed.stand_height/10 - tolerance){
        sitting_status = "Standing"
      }else if (heightCm < linakConfigYamlParsed.sit_height/10 + tolerance){
        sitting_status = "Sitting"
      }
      //console.log("heightCm: "+heightCm)
      //console.log("Standing threshold: " + linakConfigYamlParsed.stand_height/10-tolerance);
      //console.log("Sitting threshold: " + linakConfigYamlParsed.sit_height/10-tolerance);
      //console.log("Sitting status: "+ sitting_status);
      client.publish(
       `linak-2-mqtt/sitting-status`,
        sitting_status
      );
    })
  )
  .subscribe();

mqttDeskPositionCm$
  .pipe(
    switchMap(() =>
      timer(6_000).pipe(
        tap(() => {
          console.log(
            'Ping to get the height and make sure the desk appears as connected'
          );
          spawn('idasen-controller', ['--forward', '--watch']);
        }),
        repeat()
      )
    )
  )
  .subscribe();

const clientMessage$ = mqttConnect$
  .pipe(
    switchMap(() =>
      new Observable((observer) => {
        client.on('message', (topic, message) =>
          observer.next({ topic, message })
        );
      }).pipe(
        tap((x) =>
          console.log(
            `client message. Topic "${x.topic}", value: ${x.message.toString()}`
          )
        )
      )
    )
  )
  .pipe(shareReplay(1));

const mqttSetHeightCommand$ = clientMessage$
  .pipe(filter(({ topic }) => topic === `linak-2-mqtt/set-desk-height`))
  .pipe(shareReplay(1));

const mqttToggleDeskPositionCommand$ = clientMessage$
  .pipe(filter(({ topic }) => topic === `linak-2-mqtt/toggle-desk-position`))
  .pipe(shareReplay(1));

mqttSetHeightCommand$
  .pipe(
    tap(({ message }) => {
      const messageStr = message.toString();
      const heightCm = +messageStr;
      const heightMm = heightCm * 10;
      console.log(`Attempt to move desk to ${heightCm}cm`);
      spawn('idasen-controller', ['--forward', '--move-to', heightMm]);

      last_updated=Math.floor(Date.now()/1000/60)
    })
  )
  .subscribe();

const heightDiffBetweenSitAndUpCm =
  (linakConfigYamlParsed.stand_height - linakConfigYamlParsed.sit_height) / 10;
const heightBetweenSitAndUpCm =
  linakConfigYamlParsed.sit_height / 10 + heightDiffBetweenSitAndUpCm / 2;

mqttToggleDeskPositionCommand$
  .pipe(
    withLatestFrom(mqttDeskPositionCm$),
    tap(([_, heightCm]) => {
      console.log('toggling...', { heightCm, heightBetweenSitAndUpCm });

      console.log('received desk position', heightCm);
      if (heightCm < heightBetweenSitAndUpCm) {
        console.log(
          `moving to standing position, from ${heightCm}cm, to ${linakConfigYamlParsed.stand_height}cm`
        );
        spawn('idasen-controller', [
          '--forward',
          '--move-to',
          linakConfigYamlParsed.stand_height,
        ]);
      } else {
        console.log('moving to 750', heightCm);
        spawn('idasen-controller', [
          '--forward',
          '--move-to',
          linakConfigYamlParsed.sit_height,
        ]);
      }
    })
  )
  .subscribe();

const HEIGHT_REPORTED_REGXP = /height: *(\d+)mm/i;

const startServer = () => {
  return new Observable((observer) => {
    console.log('starting idasen server...');
    // const ls = spawn('bash', ['./mock.sh']);
    const ls = spawn(
      // https://stackoverflow.com/a/32636139/2398593
      'unbuffer',
      ['idasen-controller', '--config', './linak-config.yaml', '--server'],
      { shell: true }
    );

    ls.stdout.on('data', (data) => {
      const message = data.toString();
      console.log(message);

      if (message.startsWith('Connected')) {
        connected$.next();
      }

      const reMatch = message.match(HEIGHT_REPORTED_REGXP);
      if (reMatch) {
        const height = reMatch[1];
        observer.next(+height);
      }
    });

    ls.stderr.on('data', (data) => {
      // @todo
      console.log('stderr: ' + data.toString());
    });

    ls.on('exit', (code) => {
      // @todo
      console.log('child process exited with code ' + code.toString());
    });
  });
};
