'use strict';
const util = require('hcutils');

class KNXHandler {

    relayCmd(ctrl, key, value) {
        util.logMessage("INFO", `KNXHandler::relayCmd(): Turning ${(value === "1")?"on":"off"} ${ctrl.fullname}`);
        const host = ctrl.host;	
        const cmdstr = `/cgi-bin/writeVal.cgi?KNX.g%5B${ctrl.room_id}%5D.f%5B${ctrl.id}%5D.v%5B1%5D+${value}`;
        util.doRemoteCmd(host, 80, cmdstr).catch((e) => {
            util.logMessage("WARN", `KNXHandler::relayCmd(): ${e.message} for ${ctrl.fullname}`);
        });
    }

    registerControl(ctrl, callback) {
        setInterval(this._loadState, 5000, ctrl, callback);
    }

    _loadState(ctrl, callback) {
        const arg = `/cgi-bin/readVal.cgi?KNX.g%5B${ctrl.room_id}%5D.f%5B${ctrl.id}%5D.v%5B2%5D`;
        util.doRemoteCmd(ctrl.host, 80, arg).then((data) => {;
            try {
                if(data !== "0" && data !== "1") {
                    util.logMessage("WARN", `KNXHandler::loadState(): received data for ${ctrl.fullname}: ${data}`);
                }
            } catch(e) {
                util.logMessage("WARN", `KNXHandler::loadState(): ${e.message} for ${ctrl.fullname}`);
            }
            const state = (data === "1") ? "on" : "off";
            return callback(ctrl, { "state": state });
        }, (e) => { 
            if(e.code === 'EHOSTUNREACH') {
                // host offline.
                if(ctrl.state !== "offline") {
                    util.logMessage("WARN", `KNXHandler::loadState(): ${e.message} for ${ctrl.fullname}`);
                    return callback(ctrl, { "state": "offline" });
                }
            } else util.logMessage("WARN", `KNXHandler::loadState(): ${e.message} for ${ctrl.fullname}`);
        });
        return false;
    }
}

module.exports = KNXHandler;
