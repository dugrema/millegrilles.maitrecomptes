import React, {useState, useEffect, useCallback, useRef} from 'react'
import { Modal, Button, Alert } from 'react-bootstrap'
import multibase from 'multibase'

import { getUsager } from '@dugrema/millegrilles.common/lib/browser/dbUsager'
import { repondreRegistrationChallenge } from '@dugrema/millegrilles.common/lib/browser/webauthn'
import { hacherMessageSync } from '@dugrema/millegrilles.common/lib/hachage'
import { CONST_COMMANDE_AUTH, CONST_COMMANDE_SIGNER_CSR } from '@dugrema/millegrilles.common/lib/constantes'

export function ModalAjouterWebauthn(props) {

  // const [complete, setComplete] = useState(false)
  const [err, setErr] = useState('')
  const [challenge, setChallenge] = useState('')
  const [fingerprintPk, setFingerprintPk] = useState('')

  const succes = _ => {
    props.setComplete(true)
    // setTimeout(props.hide, 3000)
  }

  const {show} = props
  const connexion = props.workers.connexion
  const {nomUsager} = props.rootProps

  useEffect( _ => {
    const doasync = async _ => {
      if(show) {
        console.debug("Activer registration webauthn pour %s", nomUsager)
        const challenge = await connexion.declencherAjoutWebauthn()
        const usager = await getUsager(nomUsager)
        const fingerprintPk = await usager.fingerprintPk
        console.debug("Resultat fingerprintPk : %s", fingerprintPk)
        setFingerprintPk(fingerprintPk)
        setChallenge(challenge)
        setErr('')
        // setComplete(false)
      }
    }
    doasync().catch(err=>{console.error("Erreur enregistrement cle avec webauthn", err)})
  }, [show, nomUsager, connexion])

  const enregistrer = async event => {
    try {
      const nomUsager = props.rootProps.nomUsager

      // NB : Pour que l'enregistrement avec iOS fonctionne bien, il faut que la
      //      thread de l'evenement soit la meme que celle qui declenche
      //      navigator.credentials.create({publicKey}) sous repondreRegistrationChallenge
      const reponseChallenge = await repondreRegistrationChallenge(nomUsager, challenge, {DEBUG: true})

      const params = {
        // desactiverAutres: this.state.desactiverAutres,
        reponseChallenge,
        fingerprintPk,
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

  return (
    <Modal show={props.show} onHide={props.hide}>
      <Modal.Header closeButton>Ajouter methode d'authentification</Modal.Header>
      <Modal.Body>

        <Alert variant="danger" show={err?true:false}>
          <p>Une erreur est survenue.</p>
          <p>{err}</p>
        </Alert>

        {(!err)?
          <p>Cliquez sur suivant et suivez les instructions qui vont apparaitre a l'ecran ... </p>
          :''
        }

        <Button disabled={!challenge} onClick={enregistrer}>Suivant</Button>
        <Button variant="secondary" onClick={props.hide}>Annuler</Button>

      </Modal.Body>
    </Modal>
  )
}

export function ChallengeWebauthn(props) {
  /* Bouton webauthn */

  const {nomUsager, informationUsager, workers, confirmerAuthentification} = props
  const [attente, setAttente] = useState(false)
  const [publicKey, setPublicKey] = useState('')
  const authRef = useRef(null)

  const challengeWebauthn = informationUsager.challengeWebauthn,
        csr = props.csr

  useEffect(_=>{
    // Preparer a l'avance
    if(challengeWebauthn) {
      const doasync = async _ => {
        // Si on a un certificat local fonctionnel, signer le challenge pour
        // permettre un facteur de validation supplementaire
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
        setPublicKey(publicKey)
      }
      doasync().catch(err=>{console.error("Erreur preparation %O", err)})
    }

  }, [challengeWebauthn])

  const _authentifier = useCallback(event => {
    setAttente(true)
    console.debug("Authentifier : %s, %O (%O)", nomUsager, challengeWebauthn, event)
    authentifier(event, workers, publicKey, nomUsager, challengeWebauthn, {csr})
      .then(resultat=>{
        console.debug("_authentifier resultat : %O", resultat)
        if(resultat.auth && Object.keys(resultat.auth).length > 0) {
          confirmerAuthentification(resultat)
        }
      })
      .catch(err=>{
        if(err.code === 0) {/*OK, annule*/}
        else console.error("Erreur webauthn : %O", err)
        setAttente(false)
      })
  }, [workers, publicKey, nomUsager, challengeWebauthn, confirmerAuthentification, csr])

  useEffect(()=>{
    if(props.autologin === true && publicKey && informationUsager) {
      console.debug("Autologin")
      authRef.current.click()
    }
  }, [props.autologin, publicKey, informationUsager])

  const label = props.label || 'Suivant'
  const icon = attente?'fa fa-spinner fa-spin fa-fw':'fa fa-arrow-right'

  return (
    <Button ref={authRef} onClick={_authentifier} disabled={props.disabled}>
      {label}
      {' '}<i className={icon} />
    </Button>
  )
}

async function authentifier(event, workers, publicKey, nomUsager, challengeWebauthn, opts) {
  try {
    event.preventDefault()
    event.stopPropagation()
  } catch(err) {
    console.warning("Erreur preventDefault()/stopPropagation() : %O", err)
  }
  opts = opts || {}

  const csr = opts.csr

  // N.B. La methode doit etre appelee par la meme thread que l'event pour supporter
  //      TouchID sur iOS.
  console.debug("Signer challenge : %O (challengeWebauthn %O, opts: %O)", publicKey, challengeWebauthn, opts)

  // S'assurer qu'on a un challenge de type 'authentification'
  let challenge = publicKey.challenge

  const data = {nomUsager}

  if(csr) {
    console.debug("On va hacher le CSR et utiliser le hachage dans le challenge pour faire une demande de certificat")
    const demandeCertificat = {
      nomUsager,
      csr,
      date: Math.floor(new Date().getTime()/1000)
    }
    const hachageDemandeCert = hacherMessageSync(demandeCertificat)
    console.debug("Hachage demande cert %O = %O", hachageDemandeCert, demandeCertificat)
    data.demandeCertificat = demandeCertificat
    challenge[0] = CONST_COMMANDE_SIGNER_CSR
    challenge.set(hachageDemandeCert, 1)  // Override bytes 1-65 du challenge
    console.debug("Challenge override pour demander signature certificat : %O", publicKey)
  } else if(challenge[0] !== CONST_COMMANDE_AUTH) {
    console.error("Challenge[0] : %d !== %d", challenge[0], CONST_COMMANDE_AUTH)
    throw new Error("Erreur challenge n'est pas de type authentification (code!==1)")
  }

  const publicKeyCredentialSignee = await navigator.credentials.get({publicKey})
  console.debug("PublicKeyCredential signee : %O", publicKeyCredentialSignee)

  try {
    let challengeSigne = {challenge: challengeWebauthn.challenge}
    challengeSigne = await workers.chiffrage.formatterMessage(challengeSigne, 'signature', {attacherCertificat: true})
    data.signatureCertificat = challengeSigne
  } catch(err) {
    console.warn("Authentification - certificat non disponible, on signe avec cle du CSR", err)
  }

  const {connexion} = workers

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
  console.debug("Resultat authentification : %O", resultatAuthentification)

  return resultatAuthentification
}

export async function signerDemandeCertificat(nomUsager, challengeWebauthn, csr, opts) {
  opts = opts || {}
  // N.B. La methode doit etre appelee par la meme thread que l'event pour supporter
  //      TouchID sur iOS.
  console.debug("Signer demande certificat : %O (csr: %O)", challengeWebauthn, csr)

  const challenge = multibase.decode(challengeWebauthn.challenge)
  const data = {nomUsager}

  const demandeCertificat = {
    nomUsager,
    csr,
    date: Math.floor(new Date().getTime()/1000)
  }
  if(opts.activationTierce === true) demandeCertificat.activationTierce = true
  const hachageDemandeCert = hacherMessageSync(demandeCertificat)

  console.debug("Hachage demande cert %O = %O", hachageDemandeCert, demandeCertificat)
  data.demandeCertificat = demandeCertificat
  challenge[0] = CONST_COMMANDE_SIGNER_CSR
  challenge.set(hachageDemandeCert, 1)  // Override bytes 1-65 du challenge
  console.debug("Challenge override pour demander signature certificat : %O", challenge)

  // Remplacer cred ids, challenge multibase par array
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

  const publicKeyCredentialSignee = await navigator.credentials.get({publicKey})
  console.debug("PublicKeyCredential signee : %O", publicKeyCredentialSignee)

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

  const challengeStr = String.fromCharCode.apply(null, multibase.encode('base64', challenge))

  return {demandeCertificat, webauthn: reponseSerialisable, challenge: challengeStr}
}
