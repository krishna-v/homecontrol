#!/bin/bash

NODEJS=/usr/bin/node
export HOMECONTROL=/usr/local/share/homecontrol
export HUEBRIDGE=/usr/local/share/hue-bridge-emulator

LOGFILE=/var/log/homecontrol.log
export NODE_PATH=${HOMECONTROL}/src:${HUEBRIDGE}

if [ -f $LOGFILE ]; then
    mv $LOGFILE $LOGFILE.$(/bin/date --iso-8601=seconds)
fi
touch $LOGFILE

nohup $NODEJS $HOMECONTROL/src/homecontrol.js >> $LOGFILE 2>&1 &
