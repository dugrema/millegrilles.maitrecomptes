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
  const [attente, setAttente] = useState(false)
  const [classnameSuivant, setClassnameSuivant] = useState('fa-arrow-right')
  const [err, setErr] = useState('')

  const attendre = _ => {
    setAttente(true)
    setClassnameSuivant('fa-spinner fa-spin fa-fw')
  }
  const arreterAttente = _ => {
    setAttente(false)
    setClassnameSuivant('fa-arrow-right')
  }

  const boutonSuivant = useCallback( event => {
    event.stopPropagation()
    event.preventDefault()

    attendre()

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
    doasync().catch(err=>{
      console.error("Erreur verification nom usager : %O", err)
      arreterAttente()
      setErr(''+err)
    })

  }, [props.workers, props.nomUsager])

  const boutonAnnuler = useCallback(_=>{arreterAttente()})

  return (
    <>
      <Alert variant="danger" show={err?true:false}>
        <Alert.Heading>Erreur</Alert.Heading>
        {err}
      </Alert>

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
                onChange={props.changerNomUsager}
                disabled={attente} />

              <Form.Text className="text-muted">
                <Trans>authentification.instructions1</Trans>
              </Form.Text>

            </Form.Group>

            <Button onClick={boutonSuivant} disabled={!props.nomUsager || attente} variant="primary">
              <Trans>bouton.suivant</Trans>
              {' '}<i className={`fa ${classnameSuivant}`} />
            </Button>
            <Button onClick={boutonAnnuler} disabled={!attente} variant="secondary">
              <Trans>bouton.annuler</Trans>
            </Button>

          </Form>

        </Col>

      </Row>
    </>
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

    // Conserver information, activer les workers
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

  return reponseInscription
}

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
