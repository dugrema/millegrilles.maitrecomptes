const debug = require('debug')('millegrilles:www');
const server = require('./server')
const {initialiserApp} = require('../app');

async function init() {
  const app = await initialiserApp()
  const serverInstance = server.initServer(app);
}

init()
