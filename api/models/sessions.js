const debug = require('debug')('millegrilles:sessionsUsagers')
const MG_COOKIE = 'mg-auth-cookie'

class SessionsUsagers {

  sessionsOuvertes = {}

  ouvrirSession = (cookie, infoUsager) => {
    console.debug("Ouvrir session %s (usager: %s)", cookie, infoUsager)
    this.sessionsOuvertes[cookie] = {
      ...infoUsager,
      date: new Date(),
    }
  }

  verifierSession = (cookie) => {
    debug("Verifier session %s", cookie)
    const session = this.sessionsOuvertes[cookie]

    if(session) {
      debug(session)
      return session
    } else {
      debug("Session absente pour cookie : %s", cookie)
      return null
    }
  }

}

function init() {
  const sessions = new SessionsUsagers()

  middleware = (req, res, next) => {
    req.sessionsUsagers = sessions  // Injecter sessions dans le contexte

    extraireSession(req) // Trouver usager

    next()
  }

  return middleware
}

function extraireSession(req) {
  const mgCookieSession = req.signedCookies[MG_COOKIE]
  const sessionUsager = req.sessionsUsagers.verifierSession(mgCookieSession)
  if(sessionUsager) {
    debug('Session usager %s est ouverte', sessionUsager.nomUsager)
    req.sessionUsager = sessionUsager
    req.nomUsager = sessionUsager.nomUsager
  }
}

module.exports = {MG_COOKIE, init}
