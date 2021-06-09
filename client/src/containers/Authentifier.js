import React, {useState, useEffect, useCallback} from 'react'
import { Row, Col, Form, Button, Nav } from 'react-bootstrap'
import { Trans, useTranslation } from 'react-i18next'

export default function Authentifier(props) {

  const [nomUsager, setNomUsager] = useState('')
  const [verifierUsager, setVerifierUsager] = useState('')

  const changerNomUsager = useCallback(event=>{setNomUsager(event.currentTarget.value)}, [])

  const suivant = useCallback(_=>{setVerifierUsager(true)}, [])
  const retour = useCallback(_=>{setVerifierUsager(false)}, [])

  let etape
  if(!verifierUsager) {
    etape = (
      <SaisirUsager nomUsager={nomUsager}
                    changerNomUsager={changerNomUsager}
                    suivant={suivant} />
    )
  } else {
    etape = (
      <FormAuthentifier nomUsager={nomUsager}
                        changerNomUsager={changerNomUsager}
                        retour={retour} />
    )
  }

  return (
    <Row>
      <Col sm={1} md={2}></Col>
      <Col>{etape}</Col>
      <Col sm={1} md={2}></Col>
    </Row>
  )

}

function SaisirUsager(props) {

  const {t} = useTranslation()

  const boutonSuivant = useCallback(event=>{
    event.stopPropagation()
    event.preventDefault()
    props.suivant()
  }, [])

  return (
    <Row className="form-login">

      <Col>
        <p><Trans>authentification.accesPrive</Trans></p>

        <Form disabled={!props.nomUsager}>

          <Form.Group controlId="formNomUsager">
            <Form.Label><Trans>authentification.nomUsager</Trans></Form.Label>

            <Form.Control
              type="text"
              placeholder={t('authentification.saisirNom')}
              value={props.nomUsager}
              onChange={props.changerNomUsager} />

            <Form.Text className="text-muted">
              <Trans>authentification.instructions1</Trans>
            </Form.Text>

          </Form.Group>

          <Button onClick={boutonSuivant} disabled={!props.nomUsager} variant="primary">
            <Trans>bouton.suivant</Trans>
          </Button>

        </Form>

      </Col>

    </Row>
  )

}

function FormAuthentifier(props) {

  const [typeAuthentification, setTypeAuthentification] = useState('')

  const authentifier = useCallback(_=>{
    console.debug("Demarrer authentification")
  }, [])

  var ElementAuthentification = ''
  console.debug("Type authentification : %s", typeAuthentification)
  // switch(this.state.typeAuthentification) {
  //   case 'webauthn':
  //     ElementAuthentification = AuthentifierWebauthn
  //     break
  //   case 'csr':
  //     ElementAuthentification = AuthentifierCsr
  //     break
  //   case 'clemillegrille':
  //     ElementAuthentification = AuthentifierCertificatMillegrille
  //     break
  //   default:
  //     ElementAuthentification = props => {
  //       return <p>Methode non disponible</p>
  //     }
  // }

  return (
    <Form>

      <p>Usager : {props.nomUsager}</p>


      <Button onClick={authentifier} variant="primary">
        <Trans>bouton.suivant</Trans>
      </Button>

      <Button onClick={props.retour} variant="secondary">
        <Trans>bouton.annuler</Trans>
      </Button>

    </Form>
  )

  // <Nav variant="tabs" activeKey={props.typeAuthentification} onSelect={changerTypeAuthentification}>
  //   <Nav.Item>
  //     <Nav.Link eventKey="webauthn" disabled={!props.infoCompteUsager.challengeWebauthn && !activationDisponible}>
  //       Webauthn
  //     </Nav.Link>
  //   </Nav.Item>
  //   <Nav.Item>
  //     <Nav.Link eventKey="clemillegrille" disabled={!methodesDisponibles.includes('cleMillegrille')}>
  //       Cle de MilleGrille
  //     </Nav.Link>
  //   </Nav.Item>
  //   <Nav.Item>
  //     <Nav.Link eventKey="csr" disabled={!props.csr}>
  //       QR
  //     </Nav.Link>
  //   </Nav.Item>
  // </Nav>

  // <ElementAuthentification nomUsager={props.nomUsager}
  //                          infoCompteUsager={this.props.infoCompteUsager}
  //                          soumettreAuthentification={this.props.soumettreAuthentification}
  //                          rootProps={this.props.rootProps}
  //                          annuler={this.props.annuler}
  //                          setRegistration={this.props.setRegistration}
  //                          csr={this.state.csr} />
  //
  // <ResetCertificat certificatNavigateur={this.props.certificatNavigateur}
  //                  reset={this.props.resetCertificat}
  //                  login={this.autoLoginCertificat} />

}
