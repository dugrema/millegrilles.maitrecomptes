const debug = require('debug')('millegrilles:sessionsUsagers')

const MG_COOKIE = 'mg-auth-cookie',
      MG_EXPIRATION_SESSION_MINUTES = 30
      MG_ENTRETIEN_SECS = 60

class SessionsUsagers {

  sessionsOuvertes = {}

  intervalEntretien = null

  entretien = () => {
    // debug("Entretien sessions")
    const timestampExpire = (new Date()).getTime() - (MG_EXPIRATION_SESSION_MINUTES * 60000)
    for(let cookie in this.sessionsOuvertes) {
      const session = this.sessionsOuvertes[cookie]

      if(session.timestampActivite < timestampExpire) {
        debug("Suppression session %s (usager %s)", cookie, session.nomUsager)
        delete this.sessionsOuvertes[cookie]
      }
    }
  }

  ouvrirSession = (cookie, infoUsager) => {
    console.debug("Ouvrir session %s (usager: %s)", cookie, infoUsager)
    const timestamp = (new Date()).getTime()
    this.sessionsOuvertes[cookie] = {
      ...infoUsager,
      timestampActivite: timestamp,
      timestampCreation: timestamp
    }
  }

  verifierSession = (cookie) => {
    debug("Verifier session %s", cookie)
    const session = this.sessionsOuvertes[cookie]

    if(session) {
      debug(session)
      const timestamp = (new Date()).getTime()
      session.timestampActivite = timestamp  // Touch
      return session
    } else {
      debug("Session absente pour cookie : %s", cookie)
      return null
    }
  }

  demarrerEntretien = () => {
    this.intervalEntretien = setInterval(this.entretien, MG_ENTRETIEN_SECS * 1000)
  }

}

function init() {
  const sessions = new SessionsUsagers()
  sessions.demarrerEntretien()

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
