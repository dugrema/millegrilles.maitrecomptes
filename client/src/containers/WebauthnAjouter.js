import React, {useState, useEffect, useCallback} from 'react'
import { Modal, Button, Alert } from 'react-bootstrap'
import multibase from 'multibase'

import { repondreRegistrationChallenge } from '@dugrema/millegrilles.common/lib/browser/webauthn'

export function ModalAjouterWebauthn(props) {

  const connexion = props.workers.connexion

  // const [complete, setComplete] = useState(false)
  const [err, setErr] = useState('')

  const succes = _ => {
    props.setComplete(true)
    // setTimeout(props.hide, 3000)
  }

  useEffect(async _ => {
    if(props.show) {
      setErr('')
      // setComplete(false)

      const nomUsager = props.rootProps.nomUsager

      console.debug("Activer registration webauthn pour %s", nomUsager)
      const challenge = await connexion.declencherAjoutWebauthn()
      try {
        const reponseChallenge = await repondreRegistrationChallenge(nomUsager, challenge, {DEBUG: true})

        const params = {
          // desactiverAutres: this.state.desactiverAutres,
          reponseChallenge
        }
        if(props.resetMethodes) {
          params.desactiverAutres = true
        }

        console.debug("reponseChallenge : %O", params)

        const resultatAjout = await connexion.repondreChallengeRegistrationWebauthn(params)
        console.debug("Resultat ajout : %O", resultatAjout)
        succes()
      } catch(err) {
        console.error("Erreur auth : %O", err)
        setErr(''+err)
      }
    }
  }, [props.show])

  return (
    <Modal show={props.show} onHide={props.hide}>
      <Modal.Header closeButton>Ajouter methode d'authentification</Modal.Header>
      <Modal.Body>

        <Alert variant="danger" show={err?true:false}>
          <p>Une erreur est survenue.</p>
          <p>{err}</p>
        </Alert>

        {(!err)?
          <p>Suivez les instructions qui vont apparaitre a l'ecran ... </p>
          :''
        }

      </Modal.Body>
    </Modal>
  )
}

export function ChallengeWebauthn(props) {
  /* Bouton webauthn */

  const {nomUsager, informationUsager} = props
  const [attente, setAttente] = useState(false)

  const challenge = informationUsager.challengeWebauthn

  const _authentifier = useCallback(event => {
    setAttente(true)
    // console.debug("Authentifier : %s, %O (%O)", nomUsager, challenge, event)
    authentifier(event, props.workers, nomUsager, challenge)
      .then(resultat=>{
        // console.debug("_authentifier resultat : %O", resultat)
        if(resultat.auth && Object.keys(resultat.auth).length > 0) {
          props.confirmerAuthentification(resultat)
        }
      })
      .catch(err=>{
        if(err.code === 0) {/*OK, annule*/}
        else console.error("Erreur webauthn : %O", err)
      })
      .finally(_=>{
        setAttente(false)
      })
  }, [])

  const label = props.label || 'Suivant'
  const icon = attente?'fa fa-spinner fa-spin fa-fw':'fa fa-arrow-right'

  return (
    <Button onClick={_authentifier} disabled={props.disabled}>
      {label}
      {' '}<i className={icon} />
    </Button>
  )
}

async function authentifier(event, workers, nomUsager, challengeWebauthn) {
  event.preventDefault()
  event.stopPropagation()

  const {connexion, chiffrage} = workers
  const data = {nomUsager}

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
      return {...item, id: multibase.decode(item.id)}
    })
  }

  const publicKey = {
    ...challengeWebauthn,
    challenge,
    allowCredentials,
  }
  // console.debug("Prep publicKey : %O", publicKey)

  const publicKeyCredentialSignee = await navigator.credentials.get({publicKey})
  // console.debug("PublicKeyCredential signee : %O", publicKeyCredentialSignee)

  const reponseSignee = publicKeyCredentialSignee.response

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

  // console.debug("Reponse serialisable : %O", reponseSerialisable)

  data.webauthn = reponseSerialisable

  // console.debug("Data a soumettre pour reponse webauthn : %O", data)
  const resultatAuthentification = await connexion.authentifierWebauthn(data)
  // console.debug("Resultat authentification : %O", resultatAuthentification)

  return resultatAuthentification

}
