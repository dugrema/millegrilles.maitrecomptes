import React, {useState, useEffect, useCallback, Suspense} from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Container from 'react-bootstrap/Container'
import {proxy as comlinkProxy} from 'comlink'

import Authentifier, {AlertReauthentifier, entretienCertificat} from './Authentifier'
import Layout from './Layout'

import '../components/i18n'
import './App.css'

const AccueilUsager = React.lazy( _ => import('./AccueilUsager') )

// Methodes et instances gerees hors des lifecycle react
var _connexionWorker
var _log = []
const LOG_ACTIF = false

export default function App(props) {

  const [err, setErr] = useState('')
  const [workers, setWorkers] = useState('')
  const [dateChargementCle, setDateChargementCle] = useState('')  // Date de reload cle/certificat
  const [infoIdmg, setInfoIdmg] = useState('')
  const [connecte, setConnecte] = useState(false)
  const [etatProtege, setEtatProtege] = useState(false)
  const [nomUsager, setNomUsager] = useState('')
  const [infoUsager, setInfoUsager] = useState('')
  const [errConnexion, setErrConnexion] = useState(false)
  const [page, setPage] = useState('')
  const [log, setLog] = useState([])
  const [typeAdresse, setTypeAdresse] = useState('url')  // url, onion, etc. Utilise pour liens

  const appendLog = useCallback( valeur => {
    if(!LOG_ACTIF) return   // Desactive
     _log = [..._log, valeur]
     setLog(_log) 
    }, [setLog])
  const resetLog = useCallback( () => {_log = []; setLog(_log)}, [setLog] )

  const changerPage = useCallback( valeur => {
    if(valeur.currentTarget) valeur = valeur.currentTarget.value
    setPage(valeur)
  }, [])

  const changerInfoUsager = useCallback( infoUsager => {
    console.debug("Nouveau info usager : %O", infoUsager)
    appendLog("Charger usager")
    setInfoUsager(infoUsager)
    const nomUsager = infoUsager.nomUsager || ''

    setNomUsager(nomUsager)
    appendLog(`Usager charge : ${nomUsager}`)

    if(nomUsager) {
      _connexionWorker.socketOff('connect')
      _connexionWorker.socketOn('connect', comlinkProxy(_ =>{
        // Utilise pour les reconnexions seulement (connect initial est manque)
        reconnecter(nomUsager, setConnecte, setInfoUsager, setErrConnexion)
      }))

      const workers = { connexion: _connexionWorker }

      // S'assurer que le certificat local existe, renouveller au besoin
      console.debug("Entretien certificats de %s", nomUsager)
      entretienCertificat(workers, nomUsager, infoUsager).then(async _ => {
        initialiserClesWorkers(nomUsager, workers, setDateChargementCle)
      }).catch(err=>{
        console.error("Erreur initialisation certificat ou cle workers %O", err)
      })
    }
  }, [])

  const changerErrConnexion = useCallback( errConnexion => {
    console.warn("Erreur de connexion? %s", errConnexion)
    setErrConnexion(errConnexion)
    // Reset information usager
    let infoIdmgUpdate = {idmg: infoIdmg.idmg}
    setInfoIdmg(infoIdmgUpdate)
    setInfoUsager('')
  }, [infoIdmg, setErrConnexion, setInfoIdmg, setInfoUsager])

  // Hook changement usager
  useEffect( _ => {
    appendLog("Chargement usager")
    init(setWorkers, setInfoIdmg, setConnecte, setEtatProtege, changerInfoUsager, setDateChargementCle, changerErrConnexion, appendLog)
      .catch(err=>{
        console.error("Erreur init : %O", err)
        appendLog(`Erreur init : ${''+err}`)
      })
  }, [changerInfoUsager, changerErrConnexion] )

  useEffect( () => {
    const hostname = window.location.hostname
    if(hostname.endsWith('.onion')) {
      console.debug("Set type adresse a .onion")
      setTypeAdresse('onion')
    }
  }, [])

  const _initialiserClesWorkers = useCallback(async _nomUsager=>{
    console.debug("_initialiserClesWorkers : %O, %O", _nomUsager, workers)
    initialiserClesWorkers(_nomUsager, workers, setDateChargementCle)
      .catch(err=>{
        console.error("Erreur initialiser cles workers : %O", err)
      })
  }, [workers])

  const deconnecter = useCallback(async _=> {
    _deconnecter(setInfoIdmg, changerInfoUsager, setConnecte, setEtatProtege, changerErrConnexion, appendLog)
      .catch(err=>{console.warn("Erreur dans deconnecter : %O", err)})
  }, [changerInfoUsager, changerErrConnexion])

  const rootProps = {
    connecte, infoIdmg, etatProtege, nomUsager, dateChargementCle,
    initialiserClesWorkers: _initialiserClesWorkers,
    setPage: changerPage, setErr, deconnecter,
    verifierSession,
  }

  let contenu
  if( ! workers || connecte === false || infoIdmg === '' ) {
    const info = [<p key="entete">Chargement de la page</p>]
    let complete = 10
    if(workers) { info.push(<p key="workers">Workers charges</p>); complete = 30 }
    if(connecte) { info.push(<p key="connecte">Connecte</p>); complete = 60 }
    if(infoIdmg) { info.push(<p key="infoIdmg">IDMG {infoIdmg.idmg}</p>); complete = 100 }
    contenu = (
      <div>
        <p>Complete : {complete}%</p>
        {info}
        <Log log={log} resetLog={resetLog} />
      </div>
    )
  } else if(!nomUsager) {
    // Authentifier
    contenu = (
      <>
        <Authentifier workers={workers}
                      rootProps={rootProps}
                      appendLog={appendLog}
                      infoIdmg={infoIdmg}
                      initialiserClesWorkers={_initialiserClesWorkers}
                      setInfoUsager={changerInfoUsager}
                      confirmerAuthentification={changerInfoUsager} />
        <Log log={log} resetLog={resetLog} />
      </>
    )
  } else {
    contenu = (
      <>
        <AlertConnexionPerdue show={!connecte} />

        <AlertReauthentifier show={connecte && !etatProtege}
                             nomUsager={nomUsager}
                             infoUsager={infoUsager}
                             workers={workers}
                             confirmerAuthentification={changerInfoUsager} />

        <AccueilUsager workers={workers}
                       rootProps={rootProps}
                       page={page} 
                       typeAdresse={typeAdresse} />

        <Log log={log} resetLog={resetLog} />
      </>
    )
  }

  return (
    <Layout rootProps={rootProps} infoIdmg={infoIdmg}>

      <Suspense fallback={<ChargementEnCours />}>
        <Container className="contenu">
          <AlertError err={err} close={()=>setErr('')} />
          <AlertError err={errConnexion} close={()=>setErrConnexion('')}  />

          {contenu}

        </Container>
      </Suspense>

    </Layout>
  )

}

function Log(props) {
  if(!LOG_ACTIF) return ''
  return (
    <div>
      <div><Button onClick={props.resetLog}>Clear log</Button></div>
      <p>Log</p>
      <ol>
        {props.log.map((item, idx)=>(
          <li key={idx}>{item}</li>
        ))}
      </ol>
    </div>
  )
}

function ChargementEnCours(props) {
  return (
    <p>Chargement en cours</p>
  )
}

function AlertError(props) {
  return (
    <Alert show={props.err?true:false} dismissible onClose={props.close}>
      <Alert.Heading>Erreur</Alert.Heading>
      <pre>{props.err}</pre>
    </Alert>
  )
}

function AlertConnexionPerdue(props) {
  return (
    <Alert variant="danger" show={props.show}>
      <Alert.Heading>Connexion perdue</Alert.Heading>
    </Alert>
  )
}

async function init(
  setWorkers, setInfoIdmg, setConnecte, setEtatProtege,
  changerInfoUsager, setDateChargementCle, setErrConnexion,
  appendLog
) {
  appendLog('Preparer workers')
  // Preparer workers
  await initialiserWorkers(setWorkers, appendLog)

  appendLog('Connecter socket.io')
  const {infoIdmg} = await connecterSocketIo(
      setInfoIdmg, changerInfoUsager, setConnecte, setEtatProtege, setErrConnexion, appendLog)
  console.debug("Connexion socket.io infoIdmg: %O", infoIdmg)
  if(infoIdmg) {
    appendLog(`Socket.io connecte, idmg ${infoIdmg.idmg}`)
  } else {
    appendLog('Socket.io connecte, infoIdmg null')
  }

  const nomUsager = infoIdmg?infoIdmg.nomUsager:''
  if(nomUsager) {
    console.debug("Session existante pour usager : %s", nomUsager)
    await initialiserClesWorkers(
      nomUsager,
      { connexion: _connexionWorker },
      setDateChargementCle
    ).catch(err=>{console.warn("Erreur initialiseCleWorkers %O", err)})

    // Tenter de reconnecter les listeners proteges
    await reconnecter(nomUsager, setConnecte, changerInfoUsager, setErrConnexion)
  }

  if('storage' in navigator && 'estimate' in navigator.storage) {
    navigator.storage.estimate().then(estimate=>{
      console.debug("Estime d'espace de storage : %O", estimate)
    })
  }
}

async function initialiserWorkers(setWorkers, appendLog) {
  if(_connexionWorker === undefined ) {
    // Initialiser une seule fois
    _connexionWorker = false
    appendLog("initialiserWorkers() Importer workers.load")

    const { setupWorkers } = require('../workers/workers.load')

    console.debug("Initialiser connexion worker")
    appendLog("Initialiser connexion worker")

    const { connexion } = await setupWorkers()
    // Conserver reference globale vers les workers/instances
    _connexionWorker = connexion.webWorker

    appendLog("Verifier fonctionnement connexion worker")
    const actif = await _connexionWorker.ping()
    appendLog(`Connexion worker ok, reponse actif : ${''+actif}`)

    const workers = { connexion: _connexionWorker }
    setWorkers(workers)

    appendLog("Workers initialises")

    console.debug("Workers initialises : \nconnexion %O", connexion)
  } else {
    console.debug("Tenter init workers, deja en cours")
  }
}

async function verifierSession(appendLog) {
  /* Verifier l'etat de la session usager. Va aussi creer le cookie de session
     (au besoin). Requis avant la connexion socket.io. */
  if(appendLog) appendLog("Verifier session")
  const axios = await import('axios')
  if(appendLog) appendLog("Axios charge")
  try {
    const reponseUser = await axios.get('/millegrilles/authentification/verifier')
    console.debug("User response : %O", reponseUser)
    const headers = reponseUser.headers

    const userId = headers['x-user-id']
    const nomUsager = headers['x-user-name']
    
    if(appendLog) appendLog(`Info session userId: ${userId}, nomUsager: ${nomUsager}`)

    return {userId, nomUsager}
  } catch(err) {
    if(appendLog) appendLog(`Erreur verification session usager : ${''+err}`)
    if(err.isAxiosError && err.response.status === 401) { return false }
    console.error("Erreur verif session usager : %O", err)
    return false
  }
}

async function initialiserClesWorkers(nomUsager, workers, setDateChargementCle) {
  const {preparerWorkersAvecCles} = require('../workers/workers.load')
  await preparerWorkersAvecCles(nomUsager, [workers.connexion])
  setDateChargementCle(new Date())
  console.debug("Cles pour workers initialisees usager : %s", nomUsager)
}

async function connecterSocketIo(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion, appendLog) {

  // S'assurer que la session est creee - attendre reponse
  if(!_connexionWorker) throw new Error("Connexion worker n'est pas initialise")

  // Note : connexion socket.io est pure wss, on n'a pas de piggy-back pour
  //        recuperer le cookie de session.

  // Initialiser une premiere connexion via https pour permettre au navigateur
  // de recuperer le cookie de session.
  appendLog("Verifier session")
  await verifierSession(appendLog)

  const socketLocation = window.location.href
  appendLog(`Session verifiee, connecter socketIo a ${socketLocation}`)

  const actif = await _connexionWorker.estActif()
  console.debug("actif : %O", actif)
  appendLog(`_connexionWorkers.estActif(): ${''+actif}`)

  // const proxyLog = comlinkProxy(appendLog)
  const infoIdmg = await _connexionWorker.connecter({location: socketLocation})
    .catch(err=>{
      if(err.socketOk) {
        console.info("connecterSocketIo invoque sur socket deja ouvert")
        appendLog("connecterSocketIo invoque sur socket deja ouvert")
      } else {
        throw err
      }
    })
  console.debug("Connexion socket.io completee, info idmg : %O", infoIdmg)
  if(infoIdmg) {
    appendLog(`Connexion socket.io completee, info idmg ${infoIdmg.idmg}`)
    setInfoIdmg(infoIdmg)
    setConnecte(true)
  } else {
    appendLog(`Connexion socket.io completee, aucune info idmg`)
  }

  _connexionWorker.socketOn('disconnect', comlinkProxy(_ =>{
    console.debug("Deconnexion (modeProtege=false, connecte=false)")
    setEtatProtege(false)
    setConnecte(false)
  }))

  _connexionWorker.socketOn('modeProtege', comlinkProxy(reponse => {
    console.debug("Toggle mode protege, nouvel etat : %O", reponse)
    const modeProtege = reponse.etat
    setEtatProtege(modeProtege)
  }))

  return { infoIdmg }
}

async function reconnecter(nomUsager, setConnecte, setInfoUsager, setErrConnexion) {
  console.debug("Reconnexion usager %s", nomUsager)
  if(!nomUsager) {
    console.warn("Erreur reconnexion, nom usager non defini")
    setErrConnexion(true)
  }
  setConnecte(true)

  const infoUsager = await _connexionWorker.getInfoUsager(nomUsager)
  console.debug("Information usager recue sur reconnexion : %O", infoUsager)

  const challengeCertificat = infoUsager.challengeCertificat

  // Emettre demander d'authentification secondaire - va etre accepte
  // si la session est correctement initialisee.
  try {
    const messageFormatte = await _connexionWorker.formatterMessage(
      challengeCertificat, 'signature', {attacherCertificat: true})
    console.debug("reconnecter Message formatte : %O", messageFormatte)
    const resultat = await _connexionWorker.authentifierCertificat(messageFormatte)
    setInfoUsager(resultat)
    console.debug("Resultat reconnexion %O", resultat)
  } catch(err) {
    console.error("Erreur de reconnexion : %O", err)
    setErrConnexion('Erreur de reconnexion automatique')
  }
}

async function _deconnecter(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion, appendLog) {
  setInfoIdmg('')
  setInfoUsager('')  // Reset aussi nomUsager

  // Forcer l'expulsion de la session de l'usager
  const axios = await import('axios')
  await axios.get('/millegrilles/authentification/fermer')

  // S'assurer de creer un nouveau cookie
  await verifierSession(appendLog)

  // Deconnecter socket.io pour detruire la session, puis reconnecter pour login
  await _connexionWorker.deconnecter()

    // Preparer la prochaine session (avec cookie)
  await connecterSocketIo(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion, appendLog)
}
