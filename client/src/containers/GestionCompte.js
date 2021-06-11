import React, {useState, useEffect, useCallback} from 'react'
import {Row, Col, Button, Alert} from 'react-bootstrap'
import {ModalAjouterWebauthn} from './WebauthnAjouter'

export default function GestionCompte(props) {

  const [ajouterWebauthn, setAjouterWebauthn] = useState(false)

  return (
    <>
      <h3>Verification du compte</h3>
      <Row>
        <Col lg={8}>Ajouter une nouvelle methode (cle USB, appareil mobile, etc)</Col>
        <Col>
          <Button >Ajouter methode</Button>
        </Col>
      </Row>
      <Row>
        <Col lg={8}>
          Reset toutes les methodes. Permet de reprendre le controle si une cle
          ou un appareil est perdu ou vole. Une nouvelle methode sera configuree
          durant le reset.
        </Col>
        <Col>
          <Button>Reset</Button>
        </Col>
      </Row>
      <Row>
        <Col lg={8}>
          Activer un code QR (scan).
        </Col>
        <Col>
          <Button>Scan</Button>
        </Col>
      </Row>
      <Row>
        <Col lg={8}>
          Coller une requete de certificat PEM (CSR) pour activer un
          nouvel appareil.
        </Col>
        <Col>
          <Button>Activer</Button>
        </Col>
      </Row>
    </>
  )
}

function AjouterMethode(props) {
  return (
    <>
      <h3>Ajouter methode de verification</h3>

      <Button>Retour</Button>
    </>
  )
}
