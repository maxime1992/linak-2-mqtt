# Linak2MQTT

## Setup

### Prerequisites

### Bluetooth initial setup

Your host must have your desk paired and trusted as a bluetooth device first.  
The reason for that being: When starting out the docker we give access to the bluetooth dongle and all the config. This way the docker image is able to connect to the desk straight away.

From the host:

- `bluetoothctl`
- `[bluetooth]# power off`
- `[bluetooth]# power on`
- Press the button on the desk for 2 or 3s till the LED is blinking
- `[bluetooth]# scan on`

Example of output while the scan is on

```
Discovery started
[CHG] Controller XX:XX:XX:XX:XX:XX Discovering: yes
[CHG] Device XX:XX:XX:XX:XX:XX RSSI: -83
[CHG] Device XX:XX:XX:XX:XX:XX RSSI: -71
[NEW] Device XX:XX:XX:XX:XX:XX Desk 7734 <-- notice the [NEW] here
[CHG] Device XX:XX:XX:XX:XX:XX RSSI: -75
[CHG] Device XX:XX:XX:XX:XX:XX RSSI: -95
```

- `[bluetooth]# scan off`
- `[bluetooth]# trust XX:XX:XX:XX:XX:XX`
- `[bluetooth]# pair XX:XX:XX:XX:XX:XX`

And from here you should see the prompt like this `[Desk 7734]#` meaning you're connected to the desk, at which point you must disconnect from it by typing `[Desk 7734]# disconnect`

All the configuration on the side of the host is now done and you should not have to manipulate anything here anymore.

### Run the docker image

The docker image will connect to your desk and interact with it through MQTT so that you can interact with it the way you want.

Before building and launching it:

- Copy `linak-2-mqtt.env.template` into a new file called `linak-2-mqtt.env` and update the values
- Copy `linak-config.yaml.template` into a new file called `linak-config.yaml` and update the values (at least the mac address)

Then:

- `docker build -t linak-2-mqtt .`
- `docker run -it --rm --privileged -v /var/run/dbus:/var/run/dbus -v $(pwd)/linak-2-mqtt.env:/.env -v $(pwd)/linak-config.yaml:/linak-config.yaml linak-2-mqtt`

### MQTT access

You can listen to:

- `linak-2-mqtt/desk-height-updated` which will pass the desk height as payload in cm

You publish to:

- `linak-2-mqtt/set-desk-height` pass the desk height you wish in cm
- `linak-2-mqtt/toggle-desk-position` no payload needed

## Troubleshooting issues

If the logs show

```
[debug] Connected
starting idasen server...
Connecting
Connecting failed
Device with address XX:XX:XX:XX:XX:XX was not found.
```

Either:

- You've never connected the desk in bluetooth. Refer to `Bluetooth initial setup`
- Another device is already connected to the desk. Check first on your host machine if `bluetoothctl` shows `[bluetooth]#` or something like `[Desk 7734]#`. If it's `[bluetooth]` it means it's fine, the host is not connected to it (but you'll have to check your other devices like phone etc...), if it shows `[Desk 7734]#` the fix is easy, from here type `disconnect`: `[Desk 7734]# disconnect` and it should go back to `[bluetooth]#`. Stop and start again the docker image, everything should be fine
- Something has just gone wrong and none of the above fixes it. Try first on the host to
  - Turn the bluetooth on and off
    - `bluetoothctl`
    - `[bluetooth]# power off`
    - `[bluetooth]# power on`
  - Connect to the device again `[bluetooth]# connect XX:XX:XX:XX:XX:XX`
  - If that works, disconnect from it straight away (`[Desk 7734]# disconnect`) and relaunch the docker image
  - If that doesn't work, you may need to remove the device and make sure that you: Find it, trust it, pair it (in this order)
    - `[bluetooth]# remove XX:XX:XX:XX:XX:XX`
    - From here follow again the `Bluetooth initial setup` section

## Useful links

- https://github.com/rhyst/idasen-controller/issues/42#issuecomment-1059736659
