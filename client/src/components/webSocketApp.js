import { solveRegistrationChallenge, solveLoginChallenge } from '@webauthn/client'
import { signerChallenge, initialiserNavigateur } from '../components/pkiHelper'

export class WebSocketApp {
  constructor(socketIo) {
    this._socketIo = socketIo

    this._socketIo.on('challengeAuthCertificatNavigateur', (authRequest, cb) => {
      repondreChallengeAuthCertificatNavigateur(socketIo, authRequest, cb)
    })
  }

  generateKeyAuthenticator() {
    return soumettre(this._socketIo, 'maitredescomptes/genererKeyTotp', {})
  }

}

async function repondreChallengeAuthCertificatNavigateur(socketIo, authRequest, cb) {

  try {
    console.debug("Challenge certificat socket.io : %O", authRequest)

    const nomUsager = authRequest.nomUsager
    const challengeCertificat = authRequest.challengeCertificat

    const certificats = await initialiserNavigateur(nomUsager)

    const signature = await signerChallenge(nomUsager, challengeCertificat)

    if(certificats.fullchain) {
      const reponse = {
        certificats,
        reponseChallenge: {
          ...challengeCertificat,
          '_signature': signature,
        }
      }
      cb({ etat: true, reponse })
    } else {
      cb({ etat: false })
    }
  } catch(err) {
    console.error("Erreur reponse challenge certificat : %O", err)
    cb({etat: false})
  }

}

function soumettre(socketIo, key, params) {
  return new Promise((resolve, reject)=>{
    const timeout = setTimeout(_=>{reject(new Error('emettre: ' + key + ' Timeout socket.io'))}, 7500)
    socketIo.emit(key, params, reponse=>{
      console.debug("Reponse :%O", reponse)
      clearTimeout(timeout)
      if(reponse || reponse===false) return resolve(reponse)
      return reject({err: "Reponse invalide", reponse})
    })
  })
}
