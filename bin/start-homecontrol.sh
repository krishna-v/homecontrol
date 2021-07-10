#!/bin/bash

NODEJS=/usr/bin/node
HOMECONTROL=/usr/local/bin/homecontrol.js
LOGFILE=/var/log/homecontrol.log
export NODE_PATH=$(/usr/bin/npm root -g)

if [ -f $LOGFILE ]; then
    mv $LOGFILE $LOGFILE.$(/bin/date --iso-8601=seconds)
    touch $LOGFILE
fi

nohup $NODEJS $HOMECONTROL >> $LOGFILE 2>&1 &
