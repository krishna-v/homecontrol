'use strict';
const http = require('http'); // import { get, createServer } from 'http';

function logMessage(level, message) {
	const ts = new Date().toLocaleString( 'sv', { timeZoneName: 'short' } ).replace(/ GMT.*/, "");
	console.log(ts + ": " + level + ": " + message);
}

function doRemoteCmd(host, port, cmdpath) {
	const options = {
		hostname: host,
		port: port,
		path: cmdpath,
		method: 'GET',
		timeout: 3000
	};

	const promise = new Promise((resolve, reject) => {
		http.get(options, (res) => {
			const { statusCode } = res;
			if (statusCode !== 200 && statusCode !== 204) {
				res.resume();
				reject(Error('Request Failed.\n' + `Status Code: ${statusCode}`));
			}
			res.setEncoding('utf8');
			let rawData = '';
			res.on('data', (chunk) => { rawData += chunk; });
			res.on('end', () => { resolve(rawData); });
		}).on('error',((e) => { reject(e); }));
	});
	return promise;
}

module.exports = { logMessage, doRemoteCmd };
