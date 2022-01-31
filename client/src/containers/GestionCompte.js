import React, {useState, useEffect, useCallback} from 'react'
import {Row, Col, Button, Alert, Form} from 'react-bootstrap'
import { Trans } from 'react-i18next'
import {pki as forgePki} from 'node-forge'

import {ModalAjouterWebauthn, signerDemandeCertificat} from './WebauthnAjouter'
import { detecterAppareilsDisponibles } from '@dugrema/millegrilles.reactjs'

const QrCodeScanner = React.lazy( _=> import('./QrCodeScanner') )

export default function GestionCompte(props) {

  const [section, setSection] = useState('')
  const [videoinput, setVideoinput] = useState('')

  useEffect(_=>{
    detecterAppareilsDisponibles()
      .then(apps=>{
        console.debug("Appareils detectes : %O", apps)
        setVideoinput(apps.videoinput === true)
      })
  }, [])

  let Section
  let resetMethodes = false,
      scanQr = false

  switch(section) {

    case 'reset':
      resetMethodes = true
      Section = AjouterMethode
      break
    case 'ajouterMethode':
      Section = AjouterMethode
      break
    case 'activerCsr':
      Section = ActiverCsr
      break

    default: Section = null

  }

  if(Section) {
    return (
      <Section retour={_=>{setSection('')}}
               resetMethodes={resetMethodes}
               videoinput={videoinput}
               nomUsager={props.rootProps.nomUsager}
               {...props} />
    )
  }

  return (
    <div className="boutons-page">
      <h3>Compte usager</h3>

      <h4>Verification et protection du compte</h4>
      <Row>
        <Col lg={8}>Ajouter une nouvelle methode (cle USB, appareil mobile, etc)</Col>
        <Col>
          <Button variant="secondary" onClick={_=>{setSection('ajouterMethode')}}>Ajouter methode</Button>
        </Col>
      </Row>

      <Row>
        <Col lg={8}>
          Reinitialiser toutes les methodes. Permet de reprendre le controle si une cle
          ou un appareil est perdu ou vole. Une nouvelle methode sera configuree
          durant la reinitialisation.
        </Col>
        <Col>
          <Button variant="secondary" onClick={_=>{setSection('reset')}}>Reinitialiser</Button>
        </Col>
      </Row>

      <h4>Activer compte sur un autre appareil</h4>
      <Row>
        <Col lg={8}>
          Utiliser code QR ou coller une requete de certificat PEM (CSR) pour activer un
          nouvel appareil.
        </Col>
        <Col>
          <Button variant="secondary" onClick={_=>{setSection('activerCsr')}} videoinput={videoinput}>Activer</Button>
        </Col>
      </Row>

      <Row>
        <Col>
          <Button variant="primary" onClick={_=>{props.rootProps.setPage('')}}>Retour</Button>
        </Col>
      </Row>

    </div>
  )
}

function AjouterMethode(props) {

  const [confirmation, setConfirmation] = useState(false)
  const [show, setShow] = useState(false)

  const setComplete = _ => {
    console.debug("Registration completee avec succes")
    setTimeout(_=>{props.retour()}, 2500)
    setShow(false)
    setConfirmation(true)
  }

  const demarrer = _ => {
    setShow(true)
  }

  return (
    <>
      <ModalAjouterWebauthn show={show}
                            setComplete={setComplete}
                            hide={_=>{setShow(false)}}
                            {...props} />

      <h3>Ajouter methode de verification</h3>

      <p>Une nouvelle methode de verification va etre ajoutee a votre compte.</p>

      <Alert variant="warning" show={props.resetMethodes && confirmation?false:true}>
        <Alert.Heading>Attention</Alert.Heading>
        Les methodes existantes vont etre supprimees.
      </Alert>

      <Alert variant="success" show={confirmation?true:false}>
        <Alert.Heading>Succes</Alert.Heading>
        {props.resetMethodes?
          <p>Les methodes existantes on ete supprimees.</p>
          :''
        }
        <p>Nouvelle methode ajoutee avec succes.</p>
      </Alert>

      <div className="button-list">
        <Button onClick={demarrer}><Trans>bouton.suivant</Trans></Button>
        <Button variant="secondary" onClick={props.retour}><Trans>bouton.retour</Trans></Button>
      </div>
    </>
  )
}

function ActiverCsr(props) {

  const [csr, setCsr] = useState('')
  const [err, setErr] = useState('')
  const [challengeWebauthn, setChallengeWebauthn] = useState('')
  const [resultat, setResultat] = useState('')
  const [succes, setSucces] = useState(false)
  const [scanQr, setScanQr] = useState(false)

  const nomUsager = props.nomUsager,
        connexion = props.workers.connexion

  useEffect(_=>{
    // Valider le CSR
    if(!csr) {
      setResultat('')
      setErr('')
      return
    }
    lireCsr(csr)
      .then(resultat=>{
        if(resultat.err) {
          setErr(''+resultat.err)
          return
        } else if(nomUsager !== resultat.nomUsager) {
          setErr(`Nom usager ${resultat.nomUsager} du code QR ne correspond pas au compte de l'usager`)
          return
        }

        // Ok, certificat match
        setResultat(resultat)
        setErr('')
      })
  }, [csr, nomUsager, connexion])

  useEffect(()=>{
    connexion.getInfoUsager(nomUsager)
      .then(info=>{
        console.debug("Info usager pour verifier webauthn : %O", info)
        setChallengeWebauthn(info.challengeWebauthn)
      })
      .catch(err=>{
        console.error("Erreur demande info usager %O", err)
      })
  }, [])

  const changerCsr = useCallback(event => {
    const csr = event.currentTarget?event.currentTarget.value:event
    setCsr(csr)
    setErr('')
  }, [])

  const handleScan = pem => {
    // Convertir data en base64, puis ajouter header/footer CSR
    try {
      // const dataB64 = btoa(data)
      // const pem = `-----BEGIN CERTIFICATE REQUEST-----\n${dataB64}\n-----END CERTIFICATE REQUEST-----`
      setCsr(pem)
      setErr('')
    } catch(err) {
      setErr(''+err)
    }
  }

  const activer = async _ => {
    console.debug("Activer CSR de l'usager %s", resultat.nomUsager)
    const reponse = await activerCsr(props.workers.connexion, resultat.nomUsager, csr, challengeWebauthn)
    console.debug("Reponse activation: %O", reponse)
    setErr('')
    setResultat('')
    setSucces(true)
  }

  let zoneActivation
  if(scanQr) {
    zoneActivation = (
      <QrCodeScanner actif={(resultat || succes)?false:true}
                     setPem={handleScan}
                     handleError={err=>{setErr(''+err)}} />
    )
  } else {
    zoneActivation = (
      <Form.Group controlId="csr">
        <Form.Label>Coller le PEM ici</Form.Label>
        <Form.Control as="textarea" rows={16} onChange={changerCsr}/>
      </Form.Group>
    )
  }

  return (
    <>
      <h3>Activer fichier CSR</h3>

      <pre>
        {''+props.videoinput}        
      </pre>

      <p>
        <Button onClick={()=>setScanQr(!scanQr)} disabled={!props.videoinput}>QR</Button>
      </p>

      {zoneActivation}

      <Alert variant="danger" show={err?true:false}>
        <Alert.Heading>Erreur</Alert.Heading>
        <p>{err}</p>
      </Alert>

      <Alert variant="success" show={resultat?true:false}>
        <Alert.Heading>Code valide</Alert.Heading>
        <p>Le code est valide pour l'usager {props.nomUsager}. Cliquez sur
        le bouton Activer pour poursuivre.</p>
      </Alert>

      <Alert variant="success" show={succes}>
        <Alert.Heading>Activation reussie</Alert.Heading>
        <p>L'activation est reussie. L'appareil est maintenant actif.</p>
      </Alert>

      <Button onClick={activer} disabled={!resultat}>Activer</Button>
      <Button variant="secondary" onClick={props.retour}>Retour</Button>
    </>
  )
}

async function lireCsr(pem) {
  // Valider le contenu
  try {
    const csrForge = forgePki.certificationRequestFromPem(pem)
    const nomUsager = csrForge.subject.getField('CN').value
    return {pem, nomUsager, csrForge}
  } catch(err) {
    console.error("Erreur PEM : %O", err)
    return {err}
  }
}

async function activerCsr(connexion, nomUsager, csr, challengeWebauthn) {

  // const demandeCertificat = {
  //   nomUsager,
  //   csr,
  //   date: Math.floor(new Date().getTime()/1000),
  //   activationTierce: true,  // Flag qui indique qu'on active manuellement un certificat
  // }
  const {demandeCertificat, webauthn, challenge} = await signerDemandeCertificat(
    nomUsager, challengeWebauthn, csr, {activationTierce: true})
  const commande = {nomUsager, demandeCertificat, webauthn, challenge}

  console.debug("Requete generation certificat navigateur: \n%O", commande)
  const reponse = await connexion.genererCertificatNavigateur(commande)

  console.debug("Reponse cert recue %O", reponse)
  if(reponse && !reponse.err) {
    return true
  } else {
    throw new Error("Erreur reception confirmation d'activation")
  }

}
