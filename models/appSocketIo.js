// Gestion evenements socket.io pour /millegrilles
const debug = require('debug')('millegrilles:maitrecomptes:appSocketIo');
const {
    parseRegisterRequest,
    generateRegistrationChallenge,
    parseLoginRequest,
    generateLoginChallenge,
    verifyAuthenticatorAssertion,
} = require('@webauthn/server');
const {
    splitPEMCerts, verifierSignatureString, signerContenuString,
    validerCertificatFin, calculerIdmg, chargerClePrivee, chiffrerPrivateKey,
    matchCertificatKey, calculerHachageCertificatPEM, chargerCertificatPEM,
  } = require('millegrilles.common/lib/forgecommon')
const { genererCSRIntermediaire, genererCertificatNavigateur, genererKeyPair } = require('millegrilles.common/lib/cryptoForge')

// Enregistre les evenements prive sur le socket
async function enregistrerPrive(socket) {
  debug("Enregistrer evenements prives sur socket %s", socket.id)
  socket.on('disconnect', ()=>{deconnexion(socket)})
  socket.on('upgradeProtegerViaAuthU2F', params => {
    debug("PRIVE : upgradeProtegerViaAuthU2F")
    protegerViaAuthU2F(socket, params)
  })
  socket.on('upgradeProtegerViaMotdepasse', params => {
    debug("PRIVE : upgradeProtegerViaMotdepasse")
    protegerViaMotdepasse(socket, params)
  })
  socket.on('downgradePrive', params => {
    debug("PRIVE : downgradePrive")
    downgradePrive(socket, params)
  })
}

// Enregistre les evenements proteges sur le socket d'un usager prive
function enregistrerEvenementsProtegesUsagerPrive(socket) {
  debug("Enregistrer evenements proteges usager prive")

  socket.listenersProteges = []
  function ajouterListenerProtege(listenerName, cb) {
    socket.listenersProteges.push(listenerName)
    socket.on(listenerName, cb)
  }

  ajouterListenerProtege('associerIdmg', params => {
    debug("Associer idmg")
  })
  ajouterListenerProtege('changerMotDePasse', async (params, cb) => {
    const resultat = await changerMotDePasse(socket, params)
    cb({resultat})
  })
  ajouterListenerProtege('genererMotdepasse', params => {
    debug("Generer mot de passe")
  })
  ajouterListenerProtege('ajouterU2f', async (params, cb) => {
    debug("Ajouter U2F")
    const resultat = await ajouterU2F(socket, params)
    cb({resultat: true})
  })
  ajouterListenerProtege('desactiverU2f', params => {
    debug("Desactiver U2F")
  })

}

// Enregistre les evenements proteges sur le socket du proprietaire
function enregistrerEvenementsProtegesProprietaire(socket) {
  debug("Enregistrer evenements proteges proprietaire")

  socket.listenersProteges = []
  function ajouterListenerProtege(listenerName, cb) {
    socket.listenersProteges.push(listenerName)
    socket.on(listenerName, cb)
  }

  ajouterListenerProtege('ajouterMotdepasse', params => {
    debug("Ajouter mot de passe")
  })
  ajouterListenerProtege('changerMotDePasse', params => {
    debug("Changer mot de passe")
  })
  ajouterListenerProtege('genererMotdepasse', params => {
    debug("Generer mot de passe")
  })
  ajouterListenerProtege('ajouterU2f', params => {
    debug("Ajouter U2F")
  })
  ajouterListenerProtege('desactiverMotdepasse', params => {
    debug("Desactiver mot de passe")
  })

}

function deconnexion(socket) {
  debug("Deconnexion %s", socket.id)
}

function ajouterMotdepasse(req, res, next) {
  var infoCompteUsager = req.compteUsager

  // Verifier si un mot de passe existe deja
  if(infoCompteUsager.motdepasse) {
    debug("Mot de passe existe deja, il faut utiliser le formulaire de changement")
    return res.sendStatus(403);
  } else {
    const {motdepasseNouveau} = req.body
    var nomUsager = req.nomUsager

    const estProprietaire = req.sessionUsager.estProprietaire
    if(estProprietaire && req.body['nom-usager']) {
      nomUsager = req.body['nom-usager']
    }

    genererMotdepasse(motdepasseNouveau)
    .then(infoMotdepasse => {
      req.comptesUsagers.changerMotdepasse(nomUsager, infoMotdepasse, estProprietaire)
      if(estProprietaire) {
        // On modifie le nomUsager du proprietaire
        req.sessionUsager.nomUsager = nomUsager
      }
      return res.sendStatus(200)  // OK
    })
    .catch(err=>{
      console.error("Erreur hachage mot de passe")
      console.error(err)
      return res.sendStatus(500)
    })
  }

}

async function changerMotDePasse(socket, params) {
  debug("Changer compte usager")
  debug(params)

  const req = socket.handshake
  const session = req.session
  debug(session)

  if( session.estProprietaire ) {

    const nomUsager = socket.nomUsager
    const infoCompteUsager = await socket.comptesUsagers.infoCompteProprietaire()
    debug(infoCompteUsager)

    debug("Changer mot de passe proprietaire")
    debug(infoCompteUsager)
    const {motdepasseCourantHash, motdepasseNouveauHash} = params

    var {motdepasseHash, iterations, salt} = infoCompteUsager

    pbkdf2(motdepasseActuelHash, salt, iterations, keylen, hashFunction, (err, derivedKey) => {
      if (err) return false;

      const hashPbkdf2MotdepasseActuel = derivedKey.toString('base64')
      debug("Rehash du hash avec pbkdf2 : %s (iterations: %d, salt: %s)", hashPbkdf2MotdepasseActuel, iterations, salt)

      if(hashPbkdf2MotdepasseActuel === motdepasseHash) {
        // Le mot de passe actuel correspond au hash recu, on applique le changement

        // Generer nouveau salt, iterations et hachage
        genererMotdepasse(motdepasseNouveau)
        .then(infoMotdepasse => {
          req.comptesUsagers.changerMotdepasse(nomUsager, infoMotdepasse)
          return true
        })
        .catch(err=>{
          console.error("Erreur hachage mot de passe")
          debug(err)
          return false
        })

      } else {
        console.error("Mismatch mot de passe courant")
        return false
      }

    })

  } else {
    const nomUsager = socket.nomUsager
    const infoCompteUsager = await socket.comptesUsagers.chargerCompte(socket.nomUsager)
    debug(infoCompteUsager)

    debug("Changer mot de passe usager %s", nomUsager)
    debug(infoCompteUsager)
    const {motdepasseCourantHash, motdepasseNouveauHash} = params

    // Charger cle de compte chiffree, dechiffrer, rechiffrer avec nouveau mot de passe
    const idmgCompte = infoCompteUsager.idmgCompte
    const cleCompte = infoCompteUsager.idmgs[idmgCompte].cleChiffreeCompte
    debug("Cle chiffree compte")
    debug(cleCompte)

    try {
      const clePrivee = chargerClePrivee(cleCompte, {password: motdepasseCourantHash})
      const cleCompteRechiffree = chiffrerPrivateKey(clePrivee, motdepasseNouveauHash)
      debug("Cle rechiffree compte")
      debug(cleCompteRechiffree)

      await socket.comptesUsagers.changerCleComptePrive(nomUsager, cleCompteRechiffree)

      return true // Changement reussi

    } catch(err) {
      debug("Erreur changement mot de passe compte usager prive, mauvais mot de passe")
      return false // Echec, mauvais mot de passe courant
    }
  }

  return false
}

function genererMotdepasse(motdepasseNouveau) {
  // Generer nouveau salt et nombre d'iterations
  salt = randomBytes(128).toString('base64')
  iterations = Math.floor(Math.random() * 50000) + 75000

  return new Promise((resolve, reject) => {
    pbkdf2(motdepasseNouveau, salt, iterations, keylen, hashFunction, (err, derivedNewKey) => {
      if (err) reject(err);

      const motdepasseHash = derivedNewKey.toString('base64')
      debug("Rehash du nouveau hash avec pbkdf2 : %s (iterations: %d, salt: %s)", motdepasseHash, iterations, salt)

      const info = {
        salt,
        iterations,
        motdepasseHash,
      }
      resolve(info)
    })
  })
}

async function ajouterU2F(socket, params) {
  debug(params)

  const req = socket.handshake
  const session = req.session
  const nomUsager = session.nomUsager,
        hostname = socket.hostname
  debug(session)

  const {desactiverAutres} = params

  // Challenge via Socket.IO

  // const registrationRequest = u2f.request(MG_IDMG);
  debug("Registration request, usager %s, hostname %s", nomUsager, hostname)
  const challengeInfo = {
      relyingParty: { name: hostname },
      user: { id: nomUsager, name: nomUsager }
  }
  const registrationRequest = generateRegistrationChallenge(challengeInfo);
  // debug(registrationRequest)

  return new Promise(async (resolve, reject)=>{
    socket.emit('challengeRegistrationU2F', registrationRequest, async (reponse) => {
      debug("Reponse registration challenge")
      debug(reponse)

      if(reponse.etat) {
        const credentials = reponse.credentials
        const { key, challenge } = parseRegisterRequest(credentials);

        if( !key ) return false

        if(challenge === registrationRequest.challenge) {
          if( session.estProprietaire ) {
            debug("Challenge registration OK pour nouvelle cle proprietaire")
            await req.comptesUsagers.ajouterCleProprietaire(key, desactiverAutres)
            return true
          } else {
            const nomUsager = session.nomUsager

            debug("Challenge registration OK pour usager %s", nomUsager)
            await req.comptesUsagers.ajouterCle(nomUsager, key, desactiverAutres)
            return true
          }
        }
      } else {
        return false
      }

    })
  })

}

function desactiverMotdepasse(req, res, next) {
    const nomUsager = req.nomUsager
    const userInfo = req.compteUsager

    // S'assurer qu'il y a des cles
    if(userInfo.cles && userInfo.cles.length > 0) {
      req.comptesUsagers.supprimerMotdepasse(nomUsager)

      res.sendStatus(200)
    } else {
      debug("Le compte n'a pas au moins une cle U2F, suppression du mot de passe annulee")
      res.sendStatus(500)
    }

}

function desactiverU2f(req, res, next) {
    const nomUsager = req.nomUsager
    const userInfo = req.compteUsager
    const estProprietaire = req.sessionUsager.estProprietaire

    if(estProprietaire) {
      return res.sendStatus(403)  // Option non disponible pour le proprietaire
    }

    debug(userInfo)

    // S'assurer qu'il y a des cles
    if(userInfo.motdepasse) {
      req.comptesUsagers.supprimerCles(nomUsager)

      res.sendStatus(200)
    } else {
      debug("Le compte n'a pas au moins une cle U2F, suppression du mot de passe annulee")
      res.sendStatus(500)
    }

}

async function protegerViaAuthU2F(socket, params) {
  debug("protegerViaAuthU2F")
  const session = socket.handshake.session

  let compteUsager
  if( session.estProprietaire ) {
    compteUsager = await socket.comptesUsagers.infoCompteProprietaire()
  } else {
    compteUsager = await socket.comptesUsagers.chargerCompte(session.nomUsager)
  }

  const challengeAuthU2f = generateLoginChallenge(compteUsager.u2f)

  // TODO - Verifier challenge
  socket.emit('challengeAuthU2F', challengeAuthU2f, (reponse) => {
    debug("Reponse challenge")
    debug(reponse)

    if( session.estProprietaire ) {
      debug("Mode protege - proprietaire")
      enregistrerEvenementsProtegesProprietaire(socket)
    } else {
      debug("Mode protege - usager")
      enregistrerEvenementsProtegesUsagerPrive(socket)
    }

    socket.emit('modeProtege', {'etat': true})
  })

}

function protegerViaMotdepasse(socket, params) {
  console.debug("protegerViaMotdepasse")
  const session = socket.handshake.session

  // TODO - Verifier challenge

  if( session.estProprietaire ) {
    debug("Mode protege - proprietaire")
    enregistrerEvenementsProtegesProprietaire(socket)
  } else {
    debug("Mode protege - usager")
    enregistrerEvenementsProtegesUsagerPrive(socket)
  }
}

function downgradePrive(socket, params) {

  const listenersProteges = socket.listenersProteges

  listenersProteges.forEach(listenerName => {
    debug("Retrait listener %s", listenerName)
    socket.removeAllListeners(listenerName)
  })

  // Cleanup socket
  delete socket.listenersProteges

  socket.emit('modeProtege', {'etat': false})
}

module.exports = {
  enregistrerPrive,
  enregistrerEvenementsProtegesUsagerPrive,
  enregistrerEvenementsProtegesProprietaire,
}
