import { solveRegistrationChallenge, solveLoginChallenge } from '@webauthn/client'
import { signerChallenge, initialiserNavigateur } from '../components/pkiHelper'

export class WebSocketApp {
  constructor(socketIo) {
    this._socketIo = socketIo

    this._socketIo.on('challengeAuthCertificatNavigateur', (authRequest, cb) => {
      repondreChallengeAuthCertificatNavigateur(socketIo, authRequest, cb)
    })
  }

  // downgradePrive() {
  //
  //   // S'assurer d'avoir un seul listener
  //   this._socketIo.off('challengeAuthU2F')
  //   this._socketIo.off('challengeRegistrationU2F')
  //
  //   this._socketIo.emit('downgradePrive', {})
  // }

  // upgradeProteger(data) {
  //   // Ajout hook pour challenge
  //   return soumettre(this._socketIo, 'maitredescomptes/upgradeProteger', data)
  // }

  // prendrePossession() {
  //   // Ajout hook pour challenge
  //   const socketIo = this._socketIo
  //
  //   console.debug("Enregistrer listener challengeWebauthn")
  //   this._socketIo.off('challengeWebauthn')  // S'assurer d'avoir un seul listener
  //   this._socketIo.on('challengeWebauthn', (authRequest, cb) => {
  //     repondreLoginChallengeWebauthn(socketIo, authRequest, cb)
  //   })
  //
  //   this._socketIo.on('challengeRegistrationWebauthn', (registrationRequest, cb) => {
  //     repondreRegistrationChallengeWebauthn(socketIo, registrationRequest, cb)
  //   })
  // }

  // async getUsagerInformation(params) {
  //   return await new Promise((resolve, reject) => {
  //     const timeout = setTimeout(_=>{reject(new Error('getUsagerInformation: Timeout socket.io'))}, 7500)
  //     try {
  //       this._socketIo.emit('maitredescomptes/genererChallenge2FA', params, reponse=>{
  //         console.debug("Reponse:%O", reponse)
  //         if(!reponse) return reject("Reponse invalide")
  //         resolve(reponse)
  //       })
  //     } catch(err) {
  //       reject(err)
  //     }
  //   })
  // }

  // async genererCertificatNavigateur(params) {
  //   return new Promise((resolve, reject) => {
  //     try {
  //       this._socketIo.emit('genererCertificatNavigateur', params, reponse=>{
  //         console.debug("Reponse:%O", reponse)
  //         if(!reponse) return reject("Reponse invalide")
  //         resolve(reponse)
  //       })
  //     } catch(err) {
  //       reject(err)
  //     }
  //   })
  // }

  // async changerMotdepasse(params) {
  //   return new Promise((resolve, reject) => {
  //     try {
  //       this._socketIo.emit('maitredescomptes/changerMotDePasse', params, reponse=>{
  //         console.debug("changerMotdepasse reponse:%O", reponse)
  //         if(!reponse) return reject("Reponse invalide")
  //         resolve(reponse)
  //       })
  //     } catch(err) {
  //       reject(err)
  //     }
  //   })
  // }

  // async getCertificatsMaitredescles() {
  //   return new Promise((resolve, reject) => {
  //     try {
  //       this._socketIo.emit('getCertificatsMaitredescles', reponse=>{
  //         console.debug("Reponse:%O", reponse)
  //         if(!reponse) return reject("Reponse invalide")
  //         resolve(reponse)
  //       })
  //     } catch(err) {
  //       reject(err)
  //     }
  //   })
  // }

  // sauvegarderSecretTotp(transactionMaitredescles, transactionDocument) {
  //   return new Promise((resolve, reject) => {
  //     const timeout = setTimeout(_=>{reject(new Error('sauvegarderSecretTotp: Timeout socket.io'))}, 7500)
  //     try {
  //       // this._socketIo.emit('sauvegarderCleDocument', transactionMaitredescles, reponse_maitredescles=>{
  //       //   console.debug("Reponse maitredescles:%O", reponse_maitredescles)
  //       //   if(!reponse_maitredescles) return reject("Reponse sauvegarderCleDocument invalide")
  //         const transactions = {transactionMaitredescles, transactionDocument}
  //         this._socketIo.emit('maitredescomptes/sauvegarderSecretTotp', transactions, reponse=>{
  //           console.debug("Reponse sauvegarderSecretTotp:%O", reponse)
  //           if(!reponse) return reject("Reponse sauvegarderSecretTotp invalide")
  //
  //           clearTimeout(timeout)
  //           resolve(reponse)
  //         })
  //       // })
  //     } catch(err) {
  //       reject(err)
  //     }
  //   })
  // }

  // async declencherAjoutTokenU2f() {
  //   console.debug("declencherAjoutTokenU2f")
  //   return new Promise((resolve, reject)=>{
  //     const timeout = setTimeout(_=>{reject(new Error('declencherAjoutTokenU2f: Timeout socket.io'))}, 7500)
  //     this._socketIo.emit('maitredescomptes/challengeAjoutTokenU2f', reponse=>{
  //       console.debug("Reponse declencherAjoutTokenU2f:%O", reponse)
  //       if(!reponse) return reject("Reponse declencherAjoutTokenU2f invalide")
  //       clearTimeout(timeout)
  //       resolve(reponse)
  //     })
  //   })
  // }

  // async repondreChallengeAuthCertificatNavigateur(authResponse) {
  //   console.debug("repondreChallengeAuthCertificatNavigateur")
  //   return new Promise((resolve, reject)=>{
  //     const timeout = setTimeout(_=>{reject(new Error('declencherAjoutTokenU2f: Timeout socket.io'))}, 7500)
  //     this._socketIo.emit('maitredescomptes/ajouterU2f', authResponse, ajoutReponse=>{
  //       console.debug("Reponse repondreChallengeAuthCertificatNavigateur:%O", ajoutReponse)
  //       clearTimeout(timeout)
  //
  //       if(!ajoutReponse) return reject("Reponse repondreChallengeAuthCertificatNavigateur invalide")
  //       resolve(ajoutReponse)
  //     })
  //   })
  // }

  generateKeyAuthenticator() {
    return soumettre(this._socketIo, 'maitredescomptes/genererKeyTotp', {})
  }

}

// async function repondreLoginChallengeWebauthn(socketIo, authRequest, cb) {
//   console.debug("Webauthn request : %O", authRequest)
//   const authResponse = await solveLoginChallenge(authRequest)
//   cb(authResponse)
//
//   // Retrait listener
//   socketIo.off('challengeWebauthn')
// }
//
// async function repondreRegistrationChallengeWebauthn(socketIo, registrationRequest, cb) {
//
//   console.debug("Challenge webauthn socket.io")
//   console.debug(registrationRequest)
//
//   const credentials = await solveRegistrationChallenge(registrationRequest)
//
//   if(credentials) {
//     cb({ etat: true, credentials })
//   } else {
//     cb({ etat: false })
//   }
//
// }

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
