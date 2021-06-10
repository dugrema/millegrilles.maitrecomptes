import React, {useState, useEffect, useCallback} from 'react'
import { Modal, Button } from 'react-bootstrap'
import multibase from 'multibase'

import { repondreRegistrationChallenge } from '@dugrema/millegrilles.common/lib/browser/webauthn'

export function ModalAjouterWebauthn(props) {

  const connexion = props.workers.connexion

  useEffect(async _ => {
    if(props.show) {
      const nomUsager = props.rootProps.nomUsager

      console.debug("Activer registration webauthn pour %s", nomUsager)
      const challenge = await connexion.declencherAjoutWebauthn()
      const reponseChallenge = await repondreRegistrationChallenge(nomUsager, challenge, {DEBUG: true})

      const params = {
        // desactiverAutres: this.state.desactiverAutres,
        reponseChallenge
      }

      console.debug("reponseChallenge : %O", params)
      const resultatAjout = await connexion.repondreChallengeRegistrationWebauthn(params)
      console.debug("Resultat ajout : %O", resultatAjout)
    }
  }, [props.show])

  return (
    <Modal show={props.show} onHide={props.hide}>
      <Modal.Header closeButton>Ajouter methode d'authentification</Modal.Header>
      <Modal.Body>
        <p>Ajouter token...</p>
      </Modal.Body>
    </Modal>
  )
}

export function ChallengeWebauthn(props) {

  const {nomUsager, informationUsager} = props

  console.debug("!!! Proppys : %O", props)

  const _authentifier = useCallback(event => {
    authentifier(event, props.workers, nomUsager, challenge)
  }, [])

  const challenge = informationUsager.challengeWebauthn

  return (
    <>
      <p>Cliquer sur suivant pour continuer.</p>
      <Button onClick={_authentifier}>Suivant</Button>
    </>
  )
}

async function authentifier(event, workers, nomUsager, challengeWebauthn) {
  event.preventDefault()
  event.stopPropagation()

  const {connexion, chiffrage} = workers
  const data = {nomUsager}

  // Effectuer la verification avec cle U2F puis soumettre
  //const authRequest = infoCompteUsager.challengeWebauthn

  // Si on a un certificat local fonctionnel, signer le challenge pour
  // permettre un facteur de validation supplementaire
  try {
    let challengeSigne = {challenge: challengeWebauthn.challenge}
    challengeSigne = await chiffrage.formatterMessage(challengeSigne, 'signature', {attacherCertificat: true})
    data.signatureCertificat = challengeSigne
  } catch(err) {
    console.warn("Authentification - certificat non disponible : %O", err)
  }

  const challenge = multibase.decode(challengeWebauthn.challenge)
  var allowCredentials = challengeWebauthn.allowCredentials
  if(allowCredentials) {
    allowCredentials = allowCredentials.map(item=>{
      item.id = multibase.decode(item.id)
      return item
    })
  }
  console.debug("Challenge buffer : %O", challenge)

  const publicKey = {
    ...challengeWebauthn,
    challenge,
    allowCredentials,
  }
  console.debug("Prep publicKey : %O", publicKey)

  try {
    // this.setState({attenteReponse: true})
    const publicKeyCredentialSignee = await navigator.credentials.get({publicKey})
    console.debug("PublicKeyCredential signee : %O", publicKeyCredentialSignee)

    const reponseSignee = publicKeyCredentialSignee.response

    // const reponseEncodee = {
    //   id: publicKeyCredentialSignee.rawId,
    //   id64: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(publicKeyCredentialSignee.rawId))),
    //   response: {
    //     authenticatorData: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(reponseSignee.authenticatorData))),
    //     clientDataJSON: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(reponseSignee.clientDataJSON))),
    //     signature: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(reponseSignee.signature))),
    //     userHandle: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(reponseSignee.userHandle))),
    //   },
    //   type: publicKeyCredentialSignee.type,
    // }

    const reponseSerialisable = {
      id: publicKeyCredentialSignee.rawId,
      id64: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(publicKeyCredentialSignee.rawId))),
      response: {
        authenticatorData: reponseSignee.authenticatorData,
        clientDataJSON: reponseSignee.clientDataJSON,
        signature: reponseSignee.signature,
        userHandle: reponseSignee.userHandle,
      },
      type: publicKeyCredentialSignee.type,
    }

    // console.debug("Reponse encodee : %O", reponseEncodee)
    console.debug("Reponse serialisable : %O", reponseSerialisable)

    // data.webauthn = reponseEncodee
    data.webauthn = reponseSerialisable

    // const credentials = await solveLoginChallenge(authRequest)
    // data.u2fAuthResponse = credentials

    // await this.props.soumettreAuthentification(data)
    // remplacer appel a path /ouvrir
    console.debug("Data a soumettre pour reponse webauthn : %O", data)
    const resultatAuthentification = await connexion.authentifierWebauthn(data)
    console.debug("Resultat authentification : %O", resultatAuthentification)

    return resultatAuthentification
  } catch(err) {
    console.error("Erreur challenge reply registration security key : %O", err)
  }

}
