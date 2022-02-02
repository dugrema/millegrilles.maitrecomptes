import React, {useState, useEffect, useCallback} from 'react'
import { Row, Col, Form, Button, Alert, Modal } from 'react-bootstrap'
import { Trans, useTranslation } from 'react-i18next'
import {proxy as comlinkProxy} from 'comlink'

// import { getUsager, getListeUsagers, supprimerUsager } from '@dugrema/millegrilles.common/lib/browser/dbUsager'
import { getUsager, getListeUsagers, supprimerUsager } from '@dugrema/millegrilles.reactjs'
import { initialiserNavigateur, sauvegarderCertificatPem } from '../components/pkiHelper'

import {ChallengeWebauthn, ModalAjouterWebauthn} from './WebauthnAjouter'

// const RenderCSR = React.lazy( _=> {import('./PemUtils').then(mod=>mod.RenderCSR)})
import { RenderCSR } from './PemUtils'

const ChargementClePrivee = React.lazy(_=>import ('./ChargementCle'))

export default function Authentifier(props) {

  // console.debug("Authentifier proppys %O", props)

  const [listeUsagers, setListeUsagers] = useState('')
  const [nomUsager, setNomUsager] = useState(window.localStorage.getItem('usager')||'')
  const [informationUsager, setInformationUsager] = useState('')
  const [fingerprintPk, setFingerprintPk] = useState('')
  const [certificatActive, setCertificatActive] = useState(false)

  const {
    workers, initialiserClesWorkers,
    confirmerAuthentification: propsConfirmerAuthentification,
    setInfoUsager: propsSetInformationUsager
  } = props

  // Activer detection de nouveau certificat (e.g. signature CSR, code QR)
  useEffect(_ => {
    // console.debug("useEffect fingerprintPk : %O, %O", nomUsager, fingerprintPk)
    changementPk(workers, nomUsager, fingerprintPk, setCertificatActive)
  }, [workers, nomUsager, fingerprintPk])

  useEffect( () => {
    if(props.appendLog) props.appendLog("Get liste usagers")

    getListeUsagers().then( listeUsagers => {
      console.debug("Liste usagers locaux : %O", listeUsagers)
      setListeUsagers(listeUsagers)
      if(listeUsagers.length === 1) {
        console.debug("Default nomUsager : %s", listeUsagers[0])
        setNomUsager(listeUsagers[0])
      }
    }).catch(err=>{console.error("Erreur chargement liste usagers : %O", err)})
  }, [setListeUsagers, setNomUsager])

  // Detecter reception de nouveau certificat
  useEffect(_=>{
    if(certificatActive) {
      const login = async _ => {
        if(props.appendLog) props.appendLog("Nouveau certificat recu")
        console.debug("Nouveau certificat recu")

        // Initialiser les formatteurs si le certificat signe est disponible
        try {
          console.debug("Initialiser cles workers")
          const reponseInitWorkers = await initialiserClesWorkers(nomUsager)
          console.debug("SaisirUsager reponseInitWorkers = %O", reponseInitWorkers)
        } catch(err) {
          if(!fingerprintPk) {
            console.error("Certificat absent pour l'usager %s, erreur d'initialisation du CSR", nomUsager)
          }
        }

        // Un certificat vient d'etre active (sur reception de message). On fait
        // un login automatique.
        console.debug("Requete getInfoUsager %s (fingerprintPk: %s)", nomUsager, fingerprintPk)
        const infoAuthUsager = await chargerUsager(workers.connexion, nomUsager, fingerprintPk)
        console.debug("Information authentification usager : %O", infoAuthUsager)

        const {infoUsager, confirmation, authentifie} = infoAuthUsager

        // Si on a recu un certificat, s'assurer qu'il est sauvegarde
        setFingerprintPk('')

        if(authentifie) {
          propsConfirmerAuthentification({...infoUsager, ...confirmation})
        } else {
          propsSetInformationUsager(infoUsager)
        }
      }
      login().catch(err=>{
        console.error("Erreur login sur reception de certificat signe : %O", err)
        if(props.appendLog) props.appendLog(`Erreur login sur reception de certificat signe: ${''+err}`)
      })
    }
  }, [workers, certificatActive, initialiserClesWorkers, propsConfirmerAuthentification, propsSetInformationUsager, fingerprintPk, nomUsager])

  const confirmerAuthentification = useCallback(informationUsager => {
    console.debug("Authentifier confirmation authentification : %O", informationUsager)
    if(props.appendLog) props.appendLog(`Authentifier confirmation authentification ${informationUsager.nomUsager}`)
    propsSetInformationUsager(informationUsager)
  }, [propsSetInformationUsager])

  const changerNomUsager = useCallback(event=>{
    setNomUsager(event.currentTarget.value)
    window.localStorage.setItem('usager', event.currentTarget.value)
  }, [])
  const retour = useCallback(_=>{
    setInformationUsager('')
    // Recharger liste usagers
    getListeUsagers().then( listeUsagers => {
      console.debug("Liste usagers locaux : %O", listeUsagers)
      window.localStorage.setItem('usager', '')
      setListeUsagers(listeUsagers)
    }).catch(err=>{console.warning("Erreur chargement liste usagers : %O", err)})
  }, [])

  let etape
  if(props.infoIdmg?props.infoIdmg.userId:false && !informationUsager) {
    return (
      <>
        <p>Chargement de la page ...</p>
        <p>Reconnexion en cours ...</p>
      </>
    )
  }
  // else if(!informationUsager) {
  //   etape = (
  //     <SaisirUsager nomUsager={nomUsager}
  //                   changerNomUsager={changerNomUsager}
  //                   setInformationUsager={setInformationUsager}
  //                   listeUsagers={listeUsagers}
  //                   confirmerAuthentification={confirmerAuthentification}
  //                   workers={props.workers}
  //                   initialiserClesWorkers={props.initialiserClesWorkers}
  //                   setFingerprintPk={setFingerprintPk} />
  //   )
  // }
  else if(informationUsager.compteUsager === false) {
    // Le compte usager n'existe pas, mode creation
    etape = (
      <FormInscrire nomUsager={nomUsager}
                    retour={retour}
                    workers={props.workers}
                    confirmerAuthentification={confirmerAuthentification} />
    )
  } else {
    etape = (
      <SaisirUsager nomUsager={nomUsager}
                    changerNomUsager={changerNomUsager}
                    informationUsager={informationUsager}
                    setInformationUsager={setInformationUsager}
                    listeUsagers={listeUsagers}
                    confirmerAuthentification={confirmerAuthentification}
                    retour={retour}
                    workers={props.workers}
                    initialiserClesWorkers={props.initialiserClesWorkers}
                    setFingerprintPk={setFingerprintPk}
                    setCertificatActive={setCertificatActive}
                    setNomUsager={setNomUsager}
                    appendLog={props.appendLog} />
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

  // console.debug("SaisirUsager proppys : %O", props)

  const {t} = useTranslation()
  const [attente, setAttente] = useState(false)
  const [classnameSuivant, setClassnameSuivant] = useState('fa-arrow-right')
  const [utiliserMethodesAvancees, setUtiliserMethodesAvancees] = useState(false)
  const [nouvelUsager, setNouvelUsager] = useState(false)
  const [csr, setCsr] = useState('')
  const [err, setErr] = useState('')

  const attendre = async _ => {
    await setAttente(true)
    setClassnameSuivant('fa-spinner fa-spin fa-fw')
  }
  const arreterAttente = _ => {
    setAttente(false)
    setClassnameSuivant('fa-arrow-right')
  }

  const {
    workers, nomUsager, setNomUsager, initialiserClesWorkers, setFingerprintPk,
    confirmerAuthentification, informationUsager, setInformationUsager
  } = props
  const connexion = workers.connexion

  // console.debug("SaisirUsager informationUsager: %O", informationUsager)

  const conserverCle = useCallback(async (cles, opts) => {
    if(props.appendLog) props.appendLog(`SaisirUsager conserverCle`)
    const challengeCertificat = informationUsager.challengeCertificat
    console.debug("Cle : %O, challengeCertificat : %O, opts: %O", cles, challengeCertificat, opts)

    let challengeSigne = {...challengeCertificat, nomUsager, ...opts}

    try {
      // Authentifier avec cle de millegrille
      challengeSigne = await authentiferCleMillegrille(props.workers, cles.pem, challengeSigne)
      console.debug("Challenge signe : %O", challengeSigne)

      // Eliminer la cle de la memoire
      workers.connexion.clearCleMillegrille()
        .catch(err=>{console.warn("Erreur suppression cle de MilleGrille de la memoire", err)})

      const reponse = await workers.connexion.authentifierCleMillegrille(challengeSigne)
      console.debug("Reponse authentification avec cle de millegrille : %O", reponse)
      if(reponse.authentifie) {
        props.confirmerAuthentification({...informationUsager, ...reponse})
      }
      setUtiliserMethodesAvancees(false)  // Retour
    } catch(err) {
      console.error("Erreur authentification avec cle de millegrille : %O", err)
      setErr(<><p>Erreur authentification avec cle de millegrille:</p><p>{err}</p></>)
      arreterAttente()  // On a une reponse, arreter l'attente
    }
  }, [setUtiliserMethodesAvancees, informationUsager, workers])

  useEffect(_=>{
    if(!nomUsager) return
    if(!attente && nouvelUsager) return  // Rien a faire

    if(props.appendLog) props.appendLog(`SaisirUsager debut authentification (attente === ${''+attente})`)

    // Boucle de chargement de l'usager. Opere tant que l'usager n'est pas charge
    // ou que l'attente n'est pas annulee.
    let info = null
    const doAsync = async _ => {

      if(props.appendLog) props.appendLog(`SaisirUsager initialiser navigateur`)

      // Initialiser la base de donnees de l'usager (au besoin)
      // Verifier si on attend une signature de certificat
      const usager = await initialiserNavigateur(nomUsager)
      const certificatValide = usager.certificat?true:false,
            csr = usager.csr,
            fingerprintPk = usager.fingerprintPk
      setCsr(csr)
      console.debug("SaisirUsager.initialiserClesWorkers fingerprintPk: %s, certificatValide?", usager.fingerprintPk, certificatValide)

      if(props.appendLog) props.appendLog(`SaisirUsager csr : ${csr}`)

      //if(certificatValide) {
        // Initialiser les formatteurs si le certificat signe est disponible
        // Permet de tenter un login avec chargerUsager via certificat
        try {
          console.debug("SaisirUsager.initialiserClesWorkers Initialiser cles workers")
          if(props.appendLog) props.appendLog(`SaisirUsager initialiserClesWorkers`)
          await initialiserClesWorkers(nomUsager)
          console.debug("SaisirUsager.initialiserClesWorkers complete")
          if(props.appendLog) props.appendLog(`SaisirUsager cles workers initialisees`)
        } catch(err) {
          if(!fingerprintPk) {
            console.error("Certificat absent pour l'usager %s, erreur d'initialisation du CSR", nomUsager)
          }
        }
      //}

      let nbEssai = 0
      while(attente && !info) {
        if(nbEssai++ > 5) {
          arreterAttente()
          throw new Error("Echec authentification")
        }
        try {
          info = await chargerUsager(connexion, nomUsager, fingerprintPk)
        } catch(err) {
          console.warn("Erreur chargement info usager, on continue d'essayer %O", err)
          if(props.appendLog) props.appendLog(`Erreur chargement info usager, on continue d'essayer (err: ${''+err})`)
        }
      }
      console.debug("Resultat charger usager : %O", info)
      if(props.appendLog) props.appendLog(`Resultat charger usagers : ${''+info!==null}`)

      arreterAttente()  // On a une reponse, arreter l'attente

      const {infoUsager, confirmation, authentifie} = info

      // Si on a recu un certificat, s'assurer qu'il est sauvegarde
      if(infoUsager.certificat) {
        if(props.appendLog) props.appendLog(`Certificat recu : ${''+infoUsager.certificat}`)
        await sauvegarderCertificatPem(nomUsager, infoUsager.certificat)
        console.debug("Nouveau certificat usager conserve")

        // Initialiser les formatteurs si le certificat signe est disponible
        try {
          console.debug("Initialiser cles workers")
          await initialiserClesWorkers(nomUsager)
          console.debug("SaisirUsager initialiserClesWorkers complete")
        } catch(err) {
          console.error("Certificat absent pour l'usager %s apres activation %O", nomUsager, err)
          if(props.appendLog) props.appendLog(`Certificat absent pour l'usager ${nomUsager} apres activation`)
        }

      } else if(csr && fingerprintPk) {
        // Activer l'ecoute de l'evenement de signature du certificat
        setFingerprintPk(fingerprintPk)
      }

      if(authentifie) {
        confirmerAuthentification({...infoUsager, ...confirmation})
      } else {
        setInformationUsager(infoUsager)
      }
    }
    doAsync().catch(err=>{console.error("Erreur chargement usager %s\n(err: %O)", nomUsager, err)})

  }, [connexion, attente, nomUsager])

  const boutonSuivant = useCallback( event => {
    event.stopPropagation()
    event.preventDefault()
    attendre()
  }, [attendre])

  const changerUsager = useCallback( async nomUsager => {
    if(nomUsager.currentTarget) nomUsager = nomUsager.currentTarget.value
    // console.debug("SaisirUsager changer usager : %s", nomUsager)
    setNomUsager(nomUsager)
  }, [setNomUsager, initialiserNavigateur])

  const selectionnerUsager = useCallback( async nomUsager => {
    if(nomUsager.currentTarget) nomUsager = nomUsager.currentTarget.value
    console.debug("Set nom usager : %s", nomUsager)
    setNomUsager(nomUsager)

    // Pre-charger information de login, e.g. calculs async. Permet login one-click avec iOS.


  }, [setNomUsager, initialiserNavigateur])

  const boutonAnnuler = useCallback(_=>{arreterAttente()}, [])

  return (
    <>
      <Alert variant="danger" show={err?true:false} dismissible onClose={()=>setErr('')}>
        <Alert.Heading>Erreur</Alert.Heading>
        {err}
      </Alert>

      <Row className="form-login">

        <Col>
          <p><Trans>authentification.accesPrive</Trans></p>

          <FormSelectionnerUsager
            nomUsager={props.nomUsager}
            listeUsagers={props.listeUsagers}
            changerNomUsager={changerUsager}
            selectionnerUsager={selectionnerUsager}
            informationUsager={props.informationUsager}
            boutonSuivant={boutonSuivant}
            boutonAnnuler={boutonAnnuler}
            attente={attente}
            classnameSuivant={classnameSuivant}
            utiliserMethodesAvancees={utiliserMethodesAvancees}
            setUtiliserMethodesAvancees={setUtiliserMethodesAvancees}
            nouvelUsager={nouvelUsager}
            setNouvelUsager={setNouvelUsager} />

          <FormAuthentifier
            nomUsager={props.nomUsager}
            informationUsager={props.informationUsager}
            changerNomUsager={props.changerNomUsager}
            retour={e=>{setInformationUsager(''); setUtiliserMethodesAvancees(false); props.retour(e)}}
            workers={props.workers}
            confirmerAuthentification={props.confirmerAuthentification}
            setCertificatActive={props.setCertificatActive}
            utiliserMethodesAvancees={utiliserMethodesAvancees}
            setUtiliserMethodesAvancees={setUtiliserMethodesAvancees}
            setFingerprintPk={props.setFingerprintPk}
            nouvelUsager={nouvelUsager}
            autologin={!utiliserMethodesAvancees}
            csr={csr}
            setCsr={setCsr} 
            appendLog={props.appendLog} />
        </Col>
      </Row>

      <Row>
        <Col>
            <MethodesAuthentificationAvancees
              disabled={!utiliserMethodesAvancees || nouvelUsager}
              workers={props.workers}
              informationUsager={props.informationUsager}
              nomUsager={props.nomUsager}
              setNomUsager={setNomUsager}
              conserverCle={conserverCle}
              setFingerprintPk={props.setFingerprintPk}
              initialiserClesWorkers={initialiserClesWorkers}
              csr={csr}
              setCsr={setCsr}
              retour={e=>{setInformationUsager(''); setUtiliserMethodesAvancees(false); props.retour(e)}} />
        </Col>
      </Row>
    </>
  )

}

function FormSelectionnerUsager(props) {

  const {nouvelUsager, setNouvelUsager} = props
  const listeUsagers = props.listeUsagers || []
  const {workers, nomUsager, informationUsager, confirmerAuthentification} = props
  const {utiliserMethodesAvancees, setUtiliserMethodesAvancees} = props

  // Par defaut, afficher la liste des usagers locaux si au moins 1 present
  useEffect(()=>{ setNouvelUsager(listeUsagers.length === 0) }, [listeUsagers])

  // console.debug("FormSelectionnerUsager PROPPYS %O, listeUsagers: %O, nouvelUsager: %s", props, listeUsagers, nouvelUsager)

  return (
    <>
      <Form.Group controlId="formNomUsager">
        <Form.Label><Trans>authentification.nomUsager</Trans></Form.Label>

        <InputSaisirNomUsager disabled={!nouvelUsager} {...props} />
        <InputAfficherListeUsagers disabled={nouvelUsager} {...props} />
      </Form.Group>

      {!informationUsager?
        <Row>
          <Col xs={12} sm={3}>
            <Button onClick={props.boutonSuivant}
                    disabled={!nomUsager || props.attente}
                    variant="primary">
              <Trans>bouton.suivant</Trans>
              {' '}<i className={`fa ${props.classnameSuivant}`} />
            </Button>
            <p></p>
          </Col>
          <Col xs={12} sm={9}>
            <div className="button-list">
              <Button onClick={()=>{setNouvelUsager(true); props.changerNomUsager({currentTarget: {value: ''}});}} disabled={nouvelUsager || props.attente} variant="secondary">
                <Trans>bouton.nouveau</Trans>
              </Button>
              <Button onClick={e=>{setUtiliserMethodesAvancees(true); props.boutonSuivant(e)}}
                      disabled={!nomUsager}
                      variant="secondary">
               Options
              </Button>
              <Button onClick={props.boutonAnnuler} disabled={!props.attente} variant="secondary">
                <Trans>bouton.annuler</Trans>
              </Button>
            </div>
          </Col>
        </Row>
        :''
      }
    </>
  )
}

function InputSaisirNomUsager(props) {
  const {t} = useTranslation()

  if(props.disabled) return ''

  return (
    <>
      <Form.Control
        type="text"
        placeholder={t('authentification.saisirNom')}
        value={props.nomUsager}
        onChange={props.changerNomUsager}
        disabled={props.attente || props.informationUsager} />

      <Form.Text className="text-muted">
        <Trans>authentification.instructions1</Trans>
      </Form.Text>
    </>
  )
}

function InputAfficherListeUsagers(props) {
  const {t} = useTranslation()

  if(props.disabled || !props.listeUsagers) return ''

  const optionsUsagers = props.listeUsagers.map(nomUsager=>{
    return (
      <option value={nomUsager}>{nomUsager}</option>
    )
  })

  return (
    <>
      <Form.Select
        type="text"
        defaultValue={props.nomUsager}
        placeholder={t('authentification.saisirNom')}
        onChange={props.selectionnerUsager}
        disabled={props.attente || props.informationUsager}>

        {props.listeUsagers.map(nomUsager=>(
          <option key={nomUsager} value={nomUsager}>{nomUsager}</option>
        ))}

      </Form.Select>

      <Form.Text className="text-muted">
        <Trans>authentification.instructions2</Trans>
      </Form.Text>
    </>
  )
}

function FormAuthentifier(props) {

  // console.debug("FormAuthentifier proppys : %O", props)

  const {chiffrage, connexion} = props.workers,
        informationUsager = props.informationUsager || {},
        nomUsager = props.nomUsager,
        webauthnDisponible = informationUsager.challengeWebauthn?true:false,
        challengeCertificat = informationUsager.challengeCertificat

  const {utiliserMethodesAvancees, setUtiliserMethodesAvancees, setCsr} = props
  const csr = informationUsager.csr || props.csr

  // useEffect(()=>{
  //   if(nomUsager) {
  //     const {csr, fingerprintPk, certificatValide} = informationUsager
  //     if(!certificatValide && csr) setCsr(csr)
  //   }
  // }, [setCsr, informationUsager])

  // console.debug("FormAuthentifier proppys: %O", props)

  if( ! props.informationUsager ) return ''

  const conserverCle = async (cles, opts) => {
    console.debug("Cle : %O, opts: %O", cles, opts)
    setUtiliserMethodesAvancees(false)  // Retour

    let challengeSigne = {...challengeCertificat, nomUsager: props.nomUsager, ...opts}

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

  const confirmerAuthentification = async infoAuth => {
    // S'assurer de conserver l'usager par defaut
    window.localStorage.setItem('usager', nomUsager)

    const information = {...informationUsager, ...infoAuth}
    if(infoAuth.certificat) {
      const cert = infoAuth.certificat

      console.debug("Nouveau certificat recu, on l'installe et commence a l'utiliser %O", cert)
      try {
        await sauvegarderCertificatPem(nomUsager, cert)
        // props.rootProps.initialiserClesWorkers(props.rootProps.nomUsager)
      } catch(err) {
        console.error("Erreur sauvegarde certificat recu %O", err)
      }
    }

    // Confirgurer workers
    props.confirmerAuthentification(information)
  }

  // if(utiliserMethodesAvancees) {
  //   return <MethodesAuthentificationAvancees workers={props.workers}
  //                                            informationUsager={informationUsager}
  //                                            nomUsager={nomUsager}
  //                                            retour={_=>{setUtiliserMethodesAvancees(false)}}
  //                                            conserverCle={conserverCle}
  //                                            setFingerprintPk={props.setFingerprintPk} />
  // }

  return (
    <Form>
      <Row>
        <Col xs={12} sm={3}>
          <ChallengeWebauthn workers={props.workers}
                             nomUsager={nomUsager}
                             informationUsager={informationUsager}
                             confirmerAuthentification={confirmerAuthentification}
                             disabled={!webauthnDisponible || !nomUsager}
                             csr={csr}
                             autologin={(informationUsager.userId?false:true) && !utiliserMethodesAvancees}
                             appendLog={props.appendLog} />
          <p></p>
        </Col>
        <Col xs={12} sm={9} className="button-list">
          <Button disabled={true} variant="secondary">
           Nouveau
          </Button>

          <Button onClick={e=>{setUtiliserMethodesAvancees(true)}} disabled={props.nouvelUsager} variant="secondary">
           Options
          </Button>

          <Button onClick={props.retour} variant="secondary">
            <Trans>bouton.annuler</Trans>
          </Button>
        </Col>
      </Row>

      <AlertAucuneMethode show={!webauthnDisponible} />

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

  const {nomUsager, fingerprintPk, setFingerprintPk, disabled, initialiserClesWorkers} = props
  const {csr, setCsr} = props

  const [typeAuthentification, setTypeAuthentification] = useState('')
  const [certificat, setCertificat] = useState('')
  // const [csr, setCsr] = useState('')

  useEffect(_=>{
    if(!disabled && nomUsager) {
      initialiserNavigateur(nomUsager)
        .then(({certForge, csr})=>{
          console.debug("Certificat : %O", certForge)
          if(certForge) setCertificat(certForge)
          if(csr) setCsr(csr)
        })
    }
  }, [disabled, nomUsager])

  const resetCertificat = useCallback(async event => {
    console.debug("Reset certificat du navigateur")
    const {csr, fingerprintPk} = await initialiserNavigateur(nomUsager, {regenerer: true})

    // Activer boutons enregistrement
    setCsr(csr)

    // Activer ecoute sur fingerprint
    setFingerprintPk(fingerprintPk)

    await initialiserClesWorkers(nomUsager)
      .catch(err=>{console.error("MethodesAuthentificationAvancees Erreur initialisation cles workers")})
  }, [nomUsager, setFingerprintPk, fingerprintPk, initialiserClesWorkers])

  const retirerCompte = useCallback(async event => {
    console.debug("Retirer compte %s", nomUsager)
    await supprimerUsager(nomUsager)
    props.setNomUsager('')
    props.retour(event)
  }, [nomUsager])

  if(props.disabled) return ''

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
      <Form>

        <h4>Gestion du certificat</h4>
        <p>
          {certificat?
            `Expiration du certificat ${certificat.validity.notAfter}`
            :'Certificat expire'}
        </p>

        <Row>
          <Col lg={8}>
            <p>Reset certificat local. Permet de forcer la creation d'un nouveau certificat.</p>
          </Col>
          <Col>
            <Button variant="secondary" disabled={csr} onClick={resetCertificat}>Reset certificat</Button>
          </Col>
        </Row>

        <p></p>

        <h4>Methodes d'autorisation du navigateur</h4>
        <Row>
          <Col lg={8}>Cle de millegrille</Col>
          <Col>
            <Button variant="secondary" onClick={_=>{setTypeAuthentification('chargementClePrivee')}}>Utiliser cle</Button>
          </Col>
        </Row>

        <Row>
          <Col lg={8}>Code QR</Col>
          <Col>
            <Button variant="secondary" disabled={!csr} onClick={_=>{setTypeAuthentification('afficherQr')}}>Utiliser code QR</Button>
          </Col>
        </Row>

        <Row>
          <Col lg={8}>Fichier PEM</Col>
          <Col>
            <Button variant="secondary" disabled={!csr} onClick={_=>{setTypeAuthentification('afficherCSR')}}>Utiliser PEM</Button>
          </Col>
        </Row>

        <p></p>

        <h4>Compte</h4>
        <Row>
          <Col lg={8}>Retirer compte de la liste des usagers. Ne supprime pas le compte du serveur.</Col>
          <Col>
            <Button variant="secondary" onClick={_=>{retirerCompte()}}>Retirer</Button>
          </Col>
        </Row>

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

  const {workers, nomUsager, confirmerAuthentification} = props

  useEffect(_=>{
    // S'assurer que l'usager est initialise et qu'il a un CSR - sinon supprimer DB et recommencer
    initialiserNavigateur(nomUsager)
      .then( async ({csr, fingerprintPk, certificatValide})=>{
        console.debug("SaisirUsager.initialiserClesWorkers fingerprintPk: %s, certificatValide?", fingerprintPk, certificatValide)
        if(!csr) {
          console.debug("Init FormInscrire, pas de CSR. On en genere un.")
          // Cas special, probablement le site a ete reinitialise. Le compte n'existe pas
          // sur le serveur mais on n'a pas deja genere de CSR. Forcer la creation d'un CSR
          const {csr, fingerprintPk, certificatValide} = await initialiserNavigateur(nomUsager, {regenerer: true})
          if(!csr) console.warn("Erreur creation CSR pour l'usager")
        }
      })
  }, [])


  const inscrire = useCallback(async event => {
    console.debug("Inscrire")
    try {
      const reponse = await inscrireUsager(workers, nomUsager)

      // Conserver information, activer les workers
      console.debug("Reponse inscription usager : %O", reponse)
      await confirmerAuthentification({...reponse, nomUsager})
    } catch(err) {
      console.error("Erreur inscrire usager : %O", err)
    }
  }, [workers, nomUsager, confirmerAuthentification])

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
  const {connexion} = workers

  const {csr} = await initialiserNavigateur(nomUsager)

  console.debug("Inscrire usager %s avec CSR navigateur\n%O", nomUsager, csr)
  const reponseInscription = await connexion.inscrireUsager(nomUsager, csr)
  console.debug("Reponse inscription : %O", reponseInscription)

  // Enregistrer le certificat dans IndexedDB
  const certificatChaine = reponseInscription.certificat
  console.debug("Certificats recus : cert: %O", certificatChaine)
  await sauvegarderCertificatPem(nomUsager, certificatChaine)

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
    console.debug("Auto-login via certificat local, challenge: %O", challengeCertificat)
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

  const {connexion} = props.workers
  const nomUsager = props.rootProps.nomUsager

  useEffect( _ => {

    const doasync = async _ => {

      const usager = await getUsager(nomUsager)
      const fingerprintPk = usager.fingerprintPk
      const infoUsager = await connexion.getInfoUsager(nomUsager, fingerprintPk)
      console.debug("AlertAjouterAuthentification infoUsager : %O", infoUsager)
      // setInfoUsager(infoUsager)

      const activation = infoUsager.activation || {}

      if(activation.associe === false) {
        // setActivationIncomplete(true)
        setShow(true)
      } else if(!infoUsager.challengeWebauthn) {
        setShow(true)
      }

    }
    doasync().catch(err=>{console.error("Erreur verification activation compte %O", err)})
  }, [nomUsager, connexion])

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

  const reponseCertificat = {
    ...challengeCertificat,
  }

  const connexionWorker = workers.connexion

  await connexionWorker.chargerCleMillegrille(cles)
  console.debug("Cle de millegrille chargee, signer le message : %O", reponseCertificat)

  const signature = await connexionWorker.signerMessageCleMillegrille(reponseCertificat)
  console.debug("signerMessage: signature avec cle de millegrille : %O", signature)

  reponseCertificat['_signature'] = signature

  return reponseCertificat
}

export async function entretienCertificat(workers, nomUsager, infoUsager) {
  const usager = await initialiserNavigateur(nomUsager),
        csr = usager.csr,
        certForge = usager.certForge
  console.debug("Entretien certificat navigateur (csr? %O), certForge: %O, db usager; %O, infoUsager: %O", 
    csr, certForge, usager, infoUsager)

  const {connexion} = workers
  if(csr) {
    const reponse = await connexion.genererCertificatNavigateur({csr})
    console.debug("Reponse entretien certificat %O", reponse)
    const fullchain = reponse.certificat
    await sauvegarderCertificatPem(nomUsager, fullchain)
  } else if(infoUsager && infoUsager.delegations_date) {
    // Verifier si les regles ou delegations ont changees sur le serveur

    // ajouter 2 minutes a la date de creation, la date notBefore est ajustee
    // de 2 minutes (ConstantesGenerateurCertificat.DELTA_INITIAL)
    const dateCreationCertificat = certForge.validity.notBefore.getTime() + 120000

    // Plus recentes regles (epoch secs)
    const dateDelegations = infoUsager.delegations_date * 1000

    console.debug("Date regles (serveur) : %s (%O), date certificat local : %s (%O)",
      dateDelegations, new Date(dateDelegations), dateCreationCertificat, new Date(dateCreationCertificat))
    if(dateDelegations > dateCreationCertificat) {
      // Des regles plus recentes sont disponibles, generer un nouveau certificat
      console.info("Regles et acces plus recents disponibles pour l'usager, on regenere le certificat")
      const {csr, certForge} = await initialiserNavigateur(nomUsager, {regenerer: true})
      const reponse = await connexion.genererCertificatNavigateur({csr})
      console.debug("Reponse entretien certificat %O", reponse)
      const fullchain = reponse.certificat
      await sauvegarderCertificatPem(nomUsager, fullchain)
    }
  }
}

function AfficherCSR(props) {

  const [csrPem, getCsrPem] = useState('')

  const nomUsager = props.nomUsager

  useEffect(_=>{
    initialiserNavigateur(nomUsager)
      .then(resultat=>{
        console.debug("Resultation initialisation navigateur : %O", resultat)
        getCsrPem(resultat.csr)
      })
  }, [nomUsager])

  const copier = useCallback(event => {
    if(navigator.clipboard) {
      navigator.clipboard.writeText(csrPem)
      console.debug("CSR copie dans le clipboard")
    }
  }, [csrPem])

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

      <Button onClick={copier}>Copier</Button>
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
      await sauvegarderCertificatPem(nomUsager, certificat)
      console.debug("Nouveau certificat sauvegarde")

      // Declencher le processus d'authentification
      setCertificatActive(true)
    })
    workers.connexion.ecouterFingerprintPk(fingerprintPk, callback)
  } else if(connexion) {
    // console.debug("Retirer ecoute de signature de certificat par pk")
    connexion.arretFingerprintPk()
      .catch(err=>{
        // console.info("Erreur arret ecoute fingerprintPk", err)
      })
  }
}

function AfficherQr(props) {
  const [csrPem, setCsrPem] = useState('')

  const nomUsager = props.nomUsager

  useEffect(_=>{
    initialiserNavigateur(nomUsager)
      .then(resultat=>{
        console.debug("Resultat initialisation navigateur : %O", resultat)
        setCsrPem(resultat.csr)
      })
  }, [nomUsager])

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
