import React, {useState, useEffect, useCallback} from 'react'
import { Row, Col, Form, Button, Nav, Alert } from 'react-bootstrap'
import { Trans, useTranslation } from 'react-i18next'
import { initialiserNavigateur, sauvegarderCertificatPem } from '../components/pkiHelper'
import { splitPEMCerts } from '@dugrema/millegrilles.common/lib/forgecommon'

export default function Authentifier(props) {

  const [nomUsager, setNomUsager] = useState('')
  const [informationUsager, setInformationUsager] = useState('')

  const changerNomUsager = useCallback(event=>{setNomUsager(event.currentTarget.value)}, [])
  const retour = useCallback(_=>{setInformationUsager('')}, [])

  let etape
  if(!informationUsager) {
    etape = (
      <SaisirUsager nomUsager={nomUsager}
                    changerNomUsager={changerNomUsager}
                    setInformationUsager={setInformationUsager}
                    workers={props.workers} />
    )
  } else if(informationUsager.compteUsager === false) {
    // Le compte usager n'existe pas, mode creation
    etape = (
      <FormInscrire nomUsager={nomUsager}
                    retour={retour}
                    workers={props.workers} />
    )
  } else {
    etape = (
      <FormAuthentifier nomUsager={nomUsager}
                        informationUsager={informationUsager}
                        changerNomUsager={changerNomUsager}
                        retour={retour}
                        workers={props.workers} />
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

  const boutonSuivant = useCallback(async event=>{
    event.stopPropagation()
    event.preventDefault()

    console.debug("Requete getInfoUsager %s", props.nomUsager)

    // Charger information de l'usager
    const connexion = props.workers.connexion
    const infoUsager = await connexion.getInfoUsager(props.nomUsager)
    console.debug("Information usager recue : %O", infoUsager)
    props.setInformationUsager(infoUsager)
  }, [props.workers, props.nomUsager])

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

function FormInscrire(props) {

  const [pasEuropeen, setPasEuropeen] = useState(false)
  const togglePasEuropeen = useCallback(_=>{setPasEuropeen(!pasEuropeen)}, [pasEuropeen])

  // <Form.Control key="reponseCertificatJson" type="hidden"
  //     name="certificat-reponse-json" value={reponseCertificatJson} />

  const inscrire = useCallback(async event => {
    console.debug("Inscrire")
    const reponse = await inscrireUsager(props.workers, props.nomUsager)
    console.debug("Reponse inscription usager : %O", reponse)
  }, [])

  return (
    <Form>

      <h2>Créer un nouveau compte</h2>

      <div className="boite-coinsronds boite-authentification">

        <p>Le compte {props.nomUsager} est disponible.</p>

        <p>Pour le créer, veuillez cliquer sur le bouton Inscrire</p>

        <Alert variant="warning">
          <Alert.Heading>Note pour les européens</Alert.Heading>
          MilleGrilles utilise des biscuits témoins de monstruosités et autres
          trucs encore pires.
        </Alert>

        <Form.Group controlId="formEuropeen">
            <Form.Check type="checkbox"
                        onClick={togglePasEuropeen}
                        value={pasEuropeen}
                        label="Je ne suis pas européen" />
        </Form.Group>

        <Row>
          <Col className="button-list">
            <Button onClick={inscrire}
              disabled={ ! pasEuropeen }>Inscrire</Button>
            <Button onClick={props.retour} variant="secondary"><Trans>bouton.annuler</Trans></Button>
          </Col>
        </Row>

      </div>

    </Form>
  )

}

async function inscrireUsager(workers, nomUsager) {
  const {connexion, chiffrage} = workers

  const {csr} = await initialiserNavigateur(nomUsager)

  console.debug("CSR navigateur\n%O", csr)
  // const reponseInscription = await axios.post(this.props.authUrl + '/inscrire', requeteInscription)
  const reponseInscription = await connexion.inscrireUsager(nomUsager, csr)
  console.debug("Reponse inscription : %O", reponseInscription)

  // Enregistrer le certificat dans IndexedDB
  const certificatChaine = reponseInscription.certificat
  const certificat = certificatChaine[0]
  console.debug("Certificats recus : cert: %O\nChaine: %O", certificat, certificatChaine)
  await sauvegarderCertificatPem(nomUsager, certificat, certificatChaine)

  return true
}

// export class Confirmation extends React.Component {
//
//   state = {
//     pasEuropeen: false,
//   }
//
//   checkboxToggle = event => {
//     const name = event.currentTarget.name
//     this.setState({[name]: !this.state[name]})
//   }
//
//   inscrire = async event => {
//     console.debug("Proppys!!! %O", this.props)
//     // const requetePreparation = {nomUsager: this.props.nomUsager}
//     const {csr} = await initialiserNavigateur(this.props.nomUsager)
//
//     console.debug("CSR navigateur\n%O", csr)
//
//     // // Generer nouveau certificat de millegrille
//     // const reponsePreparation = await genererNouveauCompte(this.props.authUrl + '/preparerInscription', requetePreparation)
//     // const {
//     //   certMillegrillePEM,
//     //   certIntermediairePEM,
//     //   challengeCertificat,
//     // } = reponsePreparation
//     //
//     // var motdepasseHash = createHash('sha256').update(this.state.motdepasse, 'utf-8').digest('base64').replace(/=/g, '')
//
//     const requeteInscription = {
//       nomUsager: this.props.nomUsager,
//       csr,
//     }
//
//     console.debug("Requete inscription : %O", requeteInscription)
//
//     try {
//       const reponseInscription = await axios.post(this.props.authUrl + '/inscrire', requeteInscription)
//       console.debug("Reponse inscription : %O", reponseInscription)
//
//       // Enregistrer le certificat dans IndexedDB
//       const certificatChaine = reponseInscription.data.fullchain
//       const certificat = splitPEMCerts(certificatChaine)[0]
//       console.debug("Certificats recus : cert: %O\nChaine str: %O", certificat, certificatChaine)
//       await sauvegarderCertificatPem(this.props.nomUsager, certificat, certificatChaine)
//
//       // Faire proceder avec le login, la session est ouverte
//       // Juste a forcer un reload de la page
//       window.location.reload(false)
//
//     } catch(err) {
//       console.error("Erreur inscription : %O", err)
//     }
//
//     // if(this.state.u2f) {
//     //   // Verifier qu'on a recu le challenge U2F, generer la reponse
//     //   const challengeU2f = reponsePreparation.u2fRegistrationRequest
//     //   console.debug("Challenge U2F")
//     //   console.debug(challengeU2f)
//     //
//     //   const credentials = await solveRegistrationChallenge(challengeU2f)
//     //   requeteInscription.u2fRegistrationJson = credentials
//     // }
//     //
//     // console.debug("Challenge certificat :\n%O", challengeCertificat)
//     // const reponseCertificat = await this.props.rootProps.webWorker.formatterMessage(
//     //   this.props.challengeCertificat, 'login', {attacherCertificat: true})
//     // const reponseCertificatJson = stringify(reponseCertificat)
//     //
//     // console.debug("Requete inscription")
//     // console.debug(requeteInscription)
//     //
//     // const reponseInscription = await axios.post(this.props.authUrl + '/inscrire', requeteInscription)
//     // console.debug("Reponse inscription")
//     // console.debug(reponseInscription.data)
//     //
//     // const { certificat: certificatNavigateur, fullchain: fullchainNavigateur } = reponseInscription.data
//     // await sauvegarderCertificatPem(this.props.nomUsager, certificatNavigateur, fullchainNavigateur)
//     //
//     // if(reponseInscription.status === 201) {
//     //   console.debug("Inscription completee avec succes :\n%O", reponseInscription.data)
//     //
//     //   // Sauvegarder info dans local storage pour ce compte
//     //
//     //   this.setState({
//     //     motdepasseHash,
//     //     fullchainNavigateur,
//     //     reponseCertificatJson,
//     //     motdepasse:'', motdepasse2:'', // Reset mot de passe (eviter de le transmettre en clair)
//     //   }, ()=>{
//     //     if(this.props.submit) {
//     //       // Submit avec methode fournie - repackager event pour transmettre form
//     //       this.props.submit({currentTarget: {form}})
//     //     } else {
//     //       console.debug("PRE-SUBMIT state :\n%O", this.state)
//     //       form.submit()
//     //     }
//     //   })
//     //
//     // } else {
//     //   console.error("Erreur inscription usager : %d", reponseInscription.status)
//     // }
//
//   }
//
//   render() {
//
//     // name="" pour eviter de soumettre le mot de passe en clair
//     return (
//       <Container>
//         <Form.Control key="reponseCertificatJson" type="hidden"
//             name="certificat-reponse-json" value={this.state.reponseCertificatJson} />
//
//         <p>Le compte {this.props.nomUsager} est disponible.</p>
//
//         <p>Pour le créer, veuillez cliquer sur le bouton Inscrire</p>
//
//         <Alert variant="warning">
//           <Alert.Heading>Note pour les européens</Alert.Heading>
//           MilleGrilles utilise des biscuits témoins de monstruosités et autres
//           trucs encore pires.
//         </Alert>
//
//         <Form.Group controlId="formEuropeen">
//             <Form.Check type="checkbox" name="pasEuropeen"
//                         onClick={this.checkboxToggle}
//                         value={this.state.pasEuropeen}
//                         label="Je ne suis pas européen" />
//         </Form.Group>
//
//         <Row>
//           <Col className="button-list">
//             <Button onClick={this.inscrire}
//               disabled={ ! this.state.pasEuropeen }>Inscrire</Button>
//             <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
//           </Col>
//         </Row>
//
//       </Container>
//     )
//   }
// }
