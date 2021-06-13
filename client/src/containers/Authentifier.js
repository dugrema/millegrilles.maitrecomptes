import React, {useState, useEffect, useCallback} from 'react'
import { Row, Col, Form, Button, Nav, Alert, Modal } from 'react-bootstrap'
import { Trans, useTranslation } from 'react-i18next'
import {proxy as comlinkProxy} from 'comlink'

import { initialiserNavigateur, sauvegarderCertificatPem, getFingerprintPk } from '../components/pkiHelper'
import { splitPEMCerts } from '@dugrema/millegrilles.common/lib/forgecommon'
import { getCsr } from '@dugrema/millegrilles.common/lib/browser/dbUsager'

import {ChallengeWebauthn, ModalAjouterWebauthn} from './WebauthnAjouter'

import { RenderCSR } from './PemUtils'

const ChargementClePrivee = React.lazy(_=>import ('./ChargementCle'))
// const RenderCSR = React.lazy( _=> {import('./PemUtils').then(mod=>mod.RenderCSR)})

export default function Authentifier(props) {

  const [nomUsager, setNomUsager] = useState(window.localStorage.getItem('usager')||'')
  const [informationUsager, setInformationUsager] = useState('')
  const [fingerprintPk, setFingerprintPk] = useState('')
  const [certificatActive, setCertificatActive] = useState(false)

  // Hook changement fingerprintPk
  useEffect(_ => {
    console.debug("useEffect fingerprintPk : %O, %O", nomUsager, fingerprintPk)
    changementPk(props.workers, nomUsager, fingerprintPk, setCertificatActive)
  }, [fingerprintPk])

  useEffect(_=>{
    if(certificatActive) {
      const login = async _ => {
        console.debug("Nouveau certificat recu")

        // Initialiser les formatteurs si le certificat signe est disponible
        try {
          console.debug("Initialiser cles workers")
          const reponseInitWorkers = await props.initialiserClesWorkers(nomUsager)
          console.debug("SaisirUsager reponseInitWorkers = %O", reponseInitWorkers)
        } catch(err) {
          if(!fingerprintPk) {
            console.error("Certificat absent pour l'usager %s, erreur d'initialisation du CSR", nomUsager)
          }
        }

        // Un certificat vient d'etre active (sur reception de message). On fait
        // un login automatique.
        console.debug("Requete getInfoUsager %s (fingerprintPk: %s)", nomUsager, fingerprintPk)
        const infoAuthUsager = await chargerUsager(
          props.workers.connexion, nomUsager, fingerprintPk)
        console.debug("Information authentification usager : %O", infoAuthUsager)

        const {infoUsager, confirmation, authentifie} = infoAuthUsager

        // Si on a recu un certificat, s'assurer qu'il est sauvegarde
        setFingerprintPk('')

        if(authentifie) {
          props.confirmerAuthentification({...infoUsager, ...confirmation})
        } else {
          props.setInformationUsager(infoUsager)
        }
      }
      login().catch(err=>{console.error("Erreur login sur reception de certificat signe : %O", err)})
    }
  }, [certificatActive])

  const confirmerAuthentification = useCallback(informationUsager => {
    console.debug("Authentifier confirmation authentification : %O", informationUsager)
    props.setInfoUsager(informationUsager)
  }, [])

  const changerNomUsager = useCallback(event=>{
    setNomUsager(event.currentTarget.value)
    window.localStorage.setItem('usager', event.currentTarget.value)
  }, [])
  const retour = useCallback(_=>{setInformationUsager('')}, [])

  let etape
  if(!informationUsager) {
    etape = (
      <SaisirUsager nomUsager={nomUsager}
                    changerNomUsager={changerNomUsager}
                    setInformationUsager={setInformationUsager}
                    confirmerAuthentification={confirmerAuthentification}
                    workers={props.workers}
                    initialiserClesWorkers={props.initialiserClesWorkers}
                    setFingerprintPk={setFingerprintPk} />
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
                        confirmerAuthentification={confirmerAuthentification}
                        setCertificatActive={setCertificatActive} />
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

    attendre()  // Indicateurs d'attente

    const doasync = async _ => {
      const nomUsager = props.nomUsager
      console.debug("Initialiser usager %s", nomUsager)

      // Initialiser la base de donnees de l'usager (au besoin)
      // Verifier si on attend une signature de certificat
      const {csr, fingerprintPk} = await initialiserNavigateur(nomUsager)

      if(!csr) {
        // Initialiser les formatteurs si le certificat signe est disponible
        // Permet de tenter un login avec chargerUsager via certificat
        try {
          console.debug("Initialiser cles workers")
          await props.initialiserClesWorkers(nomUsager)
          console.debug("SaisirUsager initialiserClesWorkers complete")
        } catch(err) {
          if(!fingerprintPk) {
            console.error("Certificat absent pour l'usager %s, erreur d'initialisation du CSR", nomUsager)
          }
        }
      }

      // Charger information de l'usager. L'etat va changer en fonction
      // de l'etat du compte (existe, webauthn present, etc).
      console.debug("Requete chargerUsager %s (fingerprintPk: %s)", nomUsager, fingerprintPk)
      const resultatChargerUsager = await chargerUsager(
        props.workers.connexion, nomUsager, fingerprintPk)
      console.debug("Resultat charger usager : %O", resultatChargerUsager)
      const {infoUsager, confirmation, authentifie} = resultatChargerUsager

      // Si on a recu un certificat, s'assurer qu'il est sauvegarde
      if(infoUsager.certificat) {
        await sauvegarderCertificatPem(nomUsager, infoUsager.certificat[0], infoUsager.certificat)
        console.debug("Nouveau certificat usager conserve")

        // Initialiser les formatteurs si le certificat signe est disponible
        try {
          console.debug("Initialiser cles workers")
          await props.initialiserClesWorkers(nomUsager)
          console.debug("SaisirUsager initialiserClesWorkers complete")
        } catch(err) {
          console.error("Certificat absent pour l'usager %s apres activation %O", nomUsager, err)
        }

      } else if(csr && fingerprintPk) {
        // Activer l'ecoute de l'evenement de signature du certificat
        props.setFingerprintPk(fingerprintPk)
      }

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

          <Form onSubmit={boutonSuivant} disabled={!props.nomUsager}>

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

            <div className="button-list">
              <Button onClick={boutonSuivant} disabled={!props.nomUsager || attente} variant="primary">
                <Trans>bouton.suivant</Trans>
                {' '}<i className={`fa ${classnameSuivant}`} />
              </Button>
              <Button onClick={boutonAnnuler} disabled={!attente} variant="secondary">
                <Trans>bouton.annuler</Trans>
              </Button>
            </div>

          </Form>

        </Col>

      </Row>
    </>
  )

}

function FormAuthentifier(props) {
  const [utiliserMethodesAvancees, setUtiliserMethodesAvancees] = useState(false)
  const [formatteurReady, setFormatteurReady] = useState(false)

  const {chiffrage, connexion} = props.workers,
        informationUsager = props.informationUsager,
        nomUsager = props.nomUsager,
        webauthnDisponible = informationUsager.challengeWebauthn?true:false

  useEffect(_=>{
    connexion.isFormatteurReady()
      .then(formatteurReady=>{
        setFormatteurReady(formatteurReady)
        if(!formatteurReady) {
          // Initialiser cles et certificat de navigateur au besoin
          // if(fingerprintPk) {
          //   // Ecouter l'evenement de signature du certificat
          //
          //   // Demander le certificat par fingerprint de public key
          //   // connexion.
          // }
        }
      })
  }, [])

  const challengeCertificat = props.informationUsager.challengeCertificat

  const conserverCle = async cles => {
    console.debug("Cle : %O", cles)
    setUtiliserMethodesAvancees(false)  // Retour

    let challengeSigne = {...challengeCertificat, nomUsager: props.nomUsager}

    // Authentifier avec cle de millegrille
    challengeSigne = await authentiferCleMillegrille(props.workers, cles, challengeSigne)
    console.debug("Challenge signe : %O", challengeSigne)

    // Eliminer la cle de la memoire
    chiffrage.clearCleMillegrilleSubtle()
      .catch(err=>{console.warn("Erreur suppression cle de MilleGrille de la memoire", err)})

    const reponse = await connexion.authentifierCleMillegrille(challengeSigne)
    console.debug("Reponse authentification avec cle de millegrille : %O", reponse)
    if(reponse.authentifie) {
      props.confirmerAuthentification({...informationUsager, ...reponse})
    }
  }

  console.debug("Information usager : %O", informationUsager)

  const confirmerAuthentification = infoAuth => {
    const information = {...informationUsager, ...infoAuth}
    props.confirmerAuthentification(information)
  }

  if(utiliserMethodesAvancees) {
    return <MethodesAuthentificationAvancees workers={props.workers}
                                             informationUsager={informationUsager}
                                             nomUsager={nomUsager}
                                             retour={_=>{setUtiliserMethodesAvancees(false)}}
                                             conserverCle={conserverCle} />
  }

  return (
    <Form>

      <p>Usager : {nomUsager}</p>

      <AlertAucuneMethode show={!webauthnDisponible} />

      <div className="button-list">
        <ChallengeWebauthn workers={props.workers}
                           nomUsager={nomUsager}
                           informationUsager={informationUsager}
                           confirmerAuthentification={confirmerAuthentification}
                           disabled={!webauthnDisponible} />

        <Button onClick={_=>{setUtiliserMethodesAvancees(true)}} variant="secondary">
         Methode avancee
        </Button>

        <Button onClick={props.retour} variant="secondary">
          <Trans>bouton.annuler</Trans>
        </Button>
      </div>

    </Form>
  )

}

function AlertAucuneMethode(props) {
  return (
    <Alert show={props.show} variant="warning">
      <Alert.Heading>Aucune methode de verification disponible.</Alert.Heading>
      <p>Aucune methode de verification n'est disponible pour ce compte.</p>
      <p>Il reste possible d'utiliser les methodes avancees pour activer votre appareil.</p>
    </Alert>
  )
}

function MethodesAuthentificationAvancees(props) {

  const {nomUsager} = props

  const [typeAuthentification, setTypeAuthentification] = useState('')

  let TypeAuthentification
  switch(typeAuthentification) {
    case 'chargementClePrivee': TypeAuthentification = ChargementClePrivee; break
    case 'afficherCSR': TypeAuthentification = AfficherCSR; break
    case 'afficherQr': TypeAuthentification = AfficherQr; break
    default: TypeAuthentification = null
  }

  if(TypeAuthentification) {
    return (
      <TypeAuthentification {...props}
                            retour={_=>{setTypeAuthentification('')}} />
    )
  }

  return (
    <>
      <h3>Methodes d'authentification avancees</h3>

      <Form>

        <p>Usager : {nomUsager}</p>

        <Row>
          <Col lg={8}>Cle de millegrille</Col>
          <Col>
            <Button onClick={_=>{setTypeAuthentification('chargementClePrivee')}}>Utiliser cle</Button>
          </Col>
        </Row>

        <Row>
          <Col lg={8}>Code QR</Col>
          <Col>
            <Button onClick={_=>{setTypeAuthentification('afficherQr')}}>Utiliser code QR</Button>
          </Col>
        </Row>

        <Row>
          <Col lg={8}>Fichier PEM</Col>
          <Col>
            <Button onClick={_=>{setTypeAuthentification('afficherCSR')}}>Utiliser PEM</Button>
          </Col>
        </Row>

        <Button onClick={props.retour} variant="secondary">
          <Trans>bouton.retour</Trans>
        </Button>

      </Form>
    </>
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

async function chargerUsager(connexion, nomUsager, fingerprintPk) {
  const infoUsager = await connexion.getInfoUsager(nomUsager, fingerprintPk)
  console.debug("Information usager recue : %O", infoUsager)

  // Verifier si on peut faire un auto-login (seule methode === certificat)
  const methodesDisponibles = infoUsager.methodesDisponibles || {},
        challengeCertificat = infoUsager.challengeCertificat
  let authentifie = false

  const formatteurReady = await connexion.isFormatteurReady()
  console.debug("Formatteur ready? %s", formatteurReady)

  if(formatteurReady && methodesDisponibles.length === 1 && methodesDisponibles[0] === 'certificat' && challengeCertificat) {
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
  const [activationIncomplete, setActivationIncomplete] = useState(false)
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
    const nomUsager = props.rootProps.nomUsager

    const doasync = async _ => {

      const resultat = await getFingerprintPk(nomUsager)
      const fingerprintPk = resultat.fingerprint_pk
      const infoUsager = await connexion.getInfoUsager(nomUsager, fingerprintPk)
      console.debug("AlertAjouterAuthentification infoUsager : %O", infoUsager)
      setInfoUsager(infoUsager)

      const activation = infoUsager.activation || {}

      if(activation.associe === false) {
        setActivationIncomplete(true)
        setShow(true)
      } else if(!infoUsager.challengeWebauthn) {
        setShow(true)
      }

    }
    doasync().catch(err=>{console.error("Erreur verification activation compte %O", err)})
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

async function authentiferCleMillegrille(workers, cles, challengeCertificat) {
  console.debug("authentiferCleMillegrille : %O", cles)

  const chiffrageWorker = workers.chiffrage

  await chiffrageWorker.chargerCleMillegrilleSubtle(cles)
  console.debug("Cle de millegrille chargee, signer le message")

  var reponseCertificat = {
    ...challengeCertificat,
  }

  const signature = await chiffrageWorker.signerMessageCleMillegrille(reponseCertificat)
  console.debug("signerMessage: signature avec cle de millegrille : %O", signature)

  reponseCertificat['_signature'] = signature

  return reponseCertificat
}

export async function entretienCertificat(workers, nomUsager) {
  const {csr} = await initialiserNavigateur(nomUsager)
  console.debug("Entretien certificat navigateur (csr? %O)", csr)

  if(csr) {
    const {connexion} = workers
    const reponse = await connexion.genererCertificatNavigateur({csr})
    console.debug("Reponse entretien certificat %O", reponse)
    await sauvegarderCertificatPem(nomUsager, reponse.cert, reponse.fullchain)
  }
}

function AfficherCSR(props) {

  const [csrPem, getCsrPem] = useState('')

  useEffect(_=>{
    initialiserNavigateur(props.nomUsager)
      .then(resultat=>{
        console.debug("Resultation initialisation navigateur : %O", resultat)
        getCsrPem(resultat.csr)
      })
  }, [])

  return (
    <>
      <h3>Activer avec fichier PEM</h3>

      <p>
        Copier le fichier et le transmettre vers un autre de vos appareils pour
        activation. Vous pouvez aussi le transmettre au proprietaire de la
        MilleGrille par email ou autre messagerie - ce contenu est securitaire.
      </p>

      <Alert variant="dark" show={true}>
        <pre>{csrPem}</pre>
      </Alert>

      <p>
        Le navigateur attend maintenant l'activation de ce fichier.
        {' '}<i className="fa fa-spinner fa-spin fa-fw" />
      </p>

      <Button onClick={props.retour} variant="secondary">
        <Trans>bouton.retour</Trans>
      </Button>
    </>
  )
}

async function changementPk(workers, nomUsager, fingerprintPk, setCertificatActive) {
  const connexion = workers.connexion
  if(!connexion) return  // Worker n'est pas initialise

  if(fingerprintPk && nomUsager) {
    console.debug("Activer ecoute de signature de certificat pk=%s", fingerprintPk)
    const callback = comlinkProxy(async message=>{
      console.debug("Message activation certificat usager %s fingerprint pk: %O", nomUsager, message)

      const infoUsager = await connexion.getInfoUsager(nomUsager, fingerprintPk)
      console.debug("Information usager rechargee : %O", infoUsager)

      const certificat = infoUsager.certificat
      await sauvegarderCertificatPem(nomUsager, certificat[0], certificat)
      console.debug("Nouveau certificat sauvegarde")

      // Declencher le processus d'authentification
      setCertificatActive(true)
    })
    workers.connexion.ecouterFingerprintPk(fingerprintPk, callback)
  } else if(connexion) {
    console.debug("Retirer ecoute de signature de certificat par pk")
    connexion.arretFingerprintPk()
      .catch(err=>{
        console.info("Erreur arret ecoute fingerprintPk", err)
      })
  }
}

function AfficherQr(props) {
  const [csrPem, setCsrPem] = useState('')

  useEffect(_=>{
    initialiserNavigateur(props.nomUsager)
      .then(resultat=>{
        console.debug("Resultat initialisation navigateur : %O", resultat)
        setCsrPem(resultat.csr)
      })
  }, [])

  return (
    <>
      <h3>Activer avec un code QR</h3>

      <p>
        Scannez ce code QR avec la page <i>Activer code QR</i> a partir
        d'un autre appareil avec le meme compte.
      </p>

      <RenderCSR csr={csrPem} />

      <p>
        Le navigateur attend maintenant l'activation de ce code QR.
        {' '}<i className="fa fa-spinner fa-spin fa-fw" />
      </p>

      <Button onClick={props.retour} variant="secondary">
        <Trans>bouton.retour</Trans>
      </Button>
    </>
  )
}
