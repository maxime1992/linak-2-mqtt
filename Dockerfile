FROM ubuntu

RUN apt update -y && apt upgrade -y

RUN apt install python3 python3-pip -y

ENV TZ=Europe/Paris

RUN ln -snf /usr/share/zoneinfo/$CONTAINER_TIMEZONE /etc/localtime && echo $CONTAINER_TIMEZONE > /etc/timezone

RUN apt install bluez -y

RUN apt install build-essential libglib2.0-dev libical-dev libreadline-dev libudev-dev libdbus-1-dev libdbus-glib-1-dev bluetooth libbluetooth-dev usbutils -y

RUN pip3 install idasen-controller

RUN apt install curl -y

RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -

RUN apt install nodejs -y

COPY package.json /

RUN npm i

# following is needed as it installs the `unbuffer` command
RUN apt install expect -y

COPY run.sh /
COPY index.js /
# following for debugging purpose if needed
# COPY mock.sh /

RUN chmod a+x /run.sh

CMD [ "/run.sh" ]