#!/bin/bash

NODEJS=/usr/bin/node
HOMECONTROL=/usr/local/bin/homecontrol.js
export NODE_PATH=$(/usr/bin/npm root -g)

nohup $NODEJS $HOMECONTROL >> /var/log/homecontrol.log 2>&1 &
