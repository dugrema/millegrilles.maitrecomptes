import React, {useState, useEffect, useCallback} from 'react'
import {Row, Col, Button, Alert} from 'react-bootstrap'
import {ModalAjouterWebauthn} from './WebauthnAjouter'
import { Trans } from 'react-i18next'

export default function GestionCompte(props) {

  const [section, setSection] = useState('')

  let Section
  let resetMethodes = false
  switch(section) {

    case 'reset': resetMethodes = true
    case 'ajouterMethode': Section = AjouterMethode
    break

    case 'scanQr':
    case 'activerCsr': Section = ActiverCsr
    break

    default: Section = null

  }

  if(Section) {
    return (
      <Section retour={_=>{setSection('')}}
               resetMethodes={resetMethodes}
               {...props} />
    )
  }

  return (
    <>
      <h3>Verification du compte</h3>
      <Row>
        <Col lg={8}>Ajouter une nouvelle methode (cle USB, appareil mobile, etc)</Col>
        <Col>
          <Button onClick={_=>{setSection('ajouterMethode')}}>Ajouter methode</Button>
        </Col>
      </Row>
      <Row>
        <Col lg={8}>
          Reset toutes les methodes. Permet de reprendre le controle si une cle
          ou un appareil est perdu ou vole. Une nouvelle methode sera configuree
          durant le reset.
        </Col>
        <Col>
          <Button onClick={_=>{setSection('reset')}}>Reset</Button>
        </Col>
      </Row>
      <Row>
        <Col lg={8}>
          Activer un code QR (scan).
        </Col>
        <Col>
          <Button onClick={_=>{setSection('scanQr')}}>Scan</Button>
        </Col>
      </Row>
      <Row>
        <Col lg={8}>
          Coller une requete de certificat PEM (CSR) pour activer un
          nouvel appareil.
        </Col>
        <Col>
          <Button onClick={_=>{setSection('activerCsr')}}>Activer</Button>
        </Col>
      </Row>
    </>
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

      {props.resetMethodes?
        <p>ATTENTION : Les methodes existantes vont etre supprimees.</p>
        :''
      }

      <Alert variant="success" show={confirmation?true:false}>
        <Alert.Heading>Succes</Alert.Heading>
        {props.resetMethodes?
          <p>Les methodes existantes on ete supprimees.</p>
          :''
        }
        <p>Nouvelle methode ajoutee avec succes.</p>
      </Alert>

      <Button onClick={demarrer}><Trans>bouton.suivant</Trans></Button>
      <Button variant="secondary" onClick={props.retour}><Trans>bouton.retour</Trans></Button>
    </>
  )
}

function ActiverCsr(props) {
  return (
    <>
      <h3>Activer code QR ou CSR</h3>

      <Button onClick={props.retour}>Retour</Button>
    </>
  )
}
