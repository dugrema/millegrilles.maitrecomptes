import React, {useState, useEffect, useCallback} from 'react'
import { Row, Col, Form, Button, Nav, Alert, Modal } from 'react-bootstrap'
import { Trans, useTranslation } from 'react-i18next'
import { initialiserNavigateur, sauvegarderCertificatPem } from '../components/pkiHelper'
import { splitPEMCerts } from '@dugrema/millegrilles.common/lib/forgecommon'

import {ChallengeWebauthn, ModalAjouterWebauthn} from './WebauthnAjouter'

export default function Authentifier(props) {

  const [nomUsager, setNomUsager] = useState('')
  const [informationUsager, setInformationUsager] = useState('')

  const confirmerAuthentification = useCallback(informationUsager => {
    console.debug("Authentifier confirmation authentification : %O", informationUsager)
    props.setInfoUsager(informationUsager)
  }, [])

  const changerNomUsager = useCallback(event=>{setNomUsager(event.currentTarget.value)}, [])
  const retour = useCallback(_=>{setInformationUsager('')}, [])

  let etape
  if(!informationUsager) {
    etape = (
      <SaisirUsager nomUsager={nomUsager}
                    changerNomUsager={changerNomUsager}
                    setInformationUsager={setInformationUsager}
                    confirmerAuthentification={confirmerAuthentification}
                    workers={props.workers}
                    initialiserClesWorkers={props.initialiserClesWorkers} />
    )
  } else if(informationUsager.compteUsager === false) {
    // Le compte usager n'existe pas, mode creation
    etape = (
      <FormInscrire nomUsager={nomUsager}
                    retour={retour}
                    workers={props.workers}
                    confirmerAuthentification={confirmerAuthentification} />
    )
  } else {
    etape = (
      <FormAuthentifier nomUsager={nomUsager}
                        informationUsager={informationUsager}
                        changerNomUsager={changerNomUsager}
                        retour={retour}
                        workers={props.workers}
                        confirmerAuthentification={confirmerAuthentification} />
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

  const boutonSuivant = useCallback( event => {
    event.stopPropagation()
    event.preventDefault()

    const doasync = async _ => {
      const nomUsager = props.nomUsager
      console.debug("Initialiser usager %s", nomUsager)

      // Initialiser les formatteurs si base de donnees locale disponible
      const reponseInitWorkers = await props.initialiserClesWorkers(props.nomUsager)
      console.debug("SaisirUsager reponseInitWorkers = %O", reponseInitWorkers)

      // Charger information de l'usager. L'etat va changer en fonction
      // de l'etat du compte (existe, webauthn present, etc).
      console.debug("Requete getInfoUsager %s", props.nomUsager)
      const {infoUsager, confirmation, authentifie} = await chargerUsager(
        props.workers.connexion, props.nomUsager)
      if(authentifie) {
        props.confirmerAuthentification({...infoUsager, ...confirmation})
      } else {
        props.setInformationUsager(infoUsager)
      }
    }
    doasync().catch(err=>{console.error("Erreur verification nom usager : %O", err)})

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

  const informationUsager = props.informationUsager,
        nomUsager = props.nomUsager

  const confirmerAuthentification = infoAuth => {
    const information = {...informationUsager, ...infoAuth}
    props.confirmerAuthentification(information)
  }

  return (
    <Form>

      <p>Usager : {nomUsager}</p>

      <ChallengeWebauthn workers={props.workers}
                         nomUsager={nomUsager}
                         informationUsager={informationUsager}
                         confirmerAuthentification={confirmerAuthentification} />

      <Button onClick={props.retour} variant="secondary">
        <Trans>bouton.annuler</Trans>
      </Button>

    </Form>
  )

}

export function AlertReauthentifier(props) {
  /* Alert / Modal pour re-authentifier en cas de perte de connexion */

  const [actif, setActif] = useState(false)
  const [infoUsager, setInfoUsager] = useState('')

  const activer = async _ => {
    const infoUsager = await props.workers.connexion.getInfoUsager(props.nomUsager)
    console.debug("Information usager nouvelle : %O", infoUsager)
    setInfoUsager(infoUsager)
    setActif(true)
  }

  const confirmerAuthentification = reponse => {
    setActif(false)
    props.confirmerAuthentification({...reponse, ...infoUsager})
  }

  return (
    <>
      <Modal show={actif}>
        {(actif && infoUsager)?
          <ChallengeWebauthn workers={props.workers}
                             nomUsager={props.nomUsager}
                             informationUsager={infoUsager}
                             confirmerAuthentification={confirmerAuthentification} />
          :''
        }
      </Modal>

      <Alert show={props.show} variant="warning">
        <Alert.Heading>Authentifier</Alert.Heading>
        <p>
          La connexion a ete perdue. Veuillez vous reconnecter en cliquant sur
          le bouton authentifier.
        </p>
        <Button onClick={activer}>Authentifier</Button>
      </Alert>
    </>
  )
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
    props.confirmerAuthentification({...reponse, nomUsager: props.nomUsager})
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

  // Preparer workers avec certificat


  return reponseInscription
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

async function chargerUsager(connexion, nomUsager) {
  const infoUsager = await connexion.getInfoUsager(nomUsager)
  console.debug("Information usager recue : %O", infoUsager)

  // Verifier si on peut faire un auto-login (seule methode === certificat)
  const methodesDisponibles = infoUsager.methodesDisponibles || {},
        challengeCertificat = infoUsager.challengeCertificat
  let authentifie = false

  if(methodesDisponibles.length === 1 && methodesDisponibles[0] === 'certificat' && challengeCertificat) {
    console.debug("Auto-login via certificat local")
    try {
      const reponse = await connexion.authentifierCertificat(challengeCertificat)
      console.debug("Reponse authentifier certificat local: %O", reponse)
      if(reponse.authentifie === true) {
        // Usager authentifie avec succes
        authentifie = true
        // setInfoUsager({...reponse, ...infoUsager})  // Similaire a l'information getInfoIdmg de connecter
        return {infoUsager, confirmation: reponse, authentifie}
      }
    } catch(err) {
      // Ok, le compte est probablement protege par une authentification forte
      console.warn("Erreur auto-login : %O, %O", err, err.code)
    }
  }

  return {infoUsager, authentifie}
}

export function AlertAjouterAuthentification(props) {
  /* Verifie si l'usager doit ajouter une methode d'authentification. */

  const [infoUsager, setInfoUsager] = useState('')
  const [show, setShow] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [succes, setSucces] = useState(false)
  const hide = useCallback(_=>{setShow(false)}, [])
  const doHideModal = useCallback(_=>{setShowModal(false)}, [])
  const doShowModal = useCallback(_=>{setShowModal(true)}, [])
  const completer = useCallback(_=>{
    setShowModal(false)
    setSucces(true)
    setTimeout(_=>{setShow(false)}, 5000)
  }, [])

  useEffect( _ => {
    const {connexion} = props.workers
    connexion.getInfoUsager(props.rootProps.nomUsager)
      .then(infoUsager=>{
        console.debug("AlertAjouterAuthentification infoUsager : %O", infoUsager)
        setInfoUsager(infoUsager)
        if(!infoUsager.challengeWebauthn) setShow(true)
      })
  }, [])


  return (
    <>
      <ModalAjouterWebauthn show={showModal}
                            hide={_=>{doHideModal()}}
                            setComplete={_=>{completer()}}
                            workers={props.workers}
                            rootProps={props.rootProps} />

      <Alert variant={succes?'success':'warning'} show={show} onClose={hide} dismissible>
        <Alert.Heading>Ajouter methode de verification</Alert.Heading>

        {succes?
          <p>Methode ajoutee avec succes.</p>
          :
          <>
            <p>
              Votre compte n'a pas de methode d'authentification pour cet appareil.
              Veuillez en ajouter une en cliquant sur le bouton <i>Ajouter</i>.
            </p>
            <p>
              Sans methode d'authentification, votre pourriez perdre acces a votre
              compte.
            </p>
            <Button onClick={doShowModal}>Ajouter</Button>
          </>
        }
      </Alert>
    </>
  )

}

// async function authentifierCertificat(workers, challenge) {
//   const {connexion} = workers
//   const reponse = await connexion.authentifierCertificat(challenge)
//   console.debug("Reponse authentification certificat %O", reponse)
//   return reponse
// }
