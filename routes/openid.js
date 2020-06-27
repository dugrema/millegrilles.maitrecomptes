const debug = require('debug')('millegrilles:maitrecomptes:openid');
const express = require('express')
const { Provider } = require('oidc-provider');
const bodyParser = require('body-parser')

// express/nodejs style application callback (req, res, next) for use with express apps, see /examples/express.js
// oidc.callback
const configuration = {
  // ... see available options /docs
  clients: [{
    client_id: 'test',
    client_secret: 'test',
    redirect_uris: ['https://mg-dev4.maple.maceroc.com'],
  }],
}

const provider = new Provider('https://mg-dev4.maple.maceroc.com/millegrilles/openid2', configuration)

function initialiser(fctRabbitMQParIdmg, opts) {
  if(!opts) opts = {}

  const route = express()
  route.use(logging)
  route.use(bodyParser.urlencoded({extended: true}))

  route.get('/', (req, res, next)=>{
    res.send("Allo le monde!")
  })

  route.get('/login', login)
  route.post('/login', login)

  route.use(provider.callback)

  return route
}

function logging(req, res, next) {
  debug("Requete sur : %s", req.url)
  debug(req.headers)
  next()
}

async function login(req, res, next) {

  debug("Login Openid")
  debug(req.body)

  try {
    const { prompt: { name } } = await provider.interactionDetails(req, res);
    const account = {accountId: 'test', detail: 'info compte'}

    const result = {
      select_account: {}, // make sure its skipped by the interaction policy since we just logged in
      login: {
        account: account.accountId,
      },
    };

    await provider.interactionFinished(req, res, result, { mergeWithLastSubmission: false });
  } catch (err) {
    next(err);
  }

}

module.exports = { initialiser }
