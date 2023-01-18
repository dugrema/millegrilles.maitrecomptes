import { lazy, useState, useEffect, useCallback, Suspense } from 'react'
import Container from 'react-bootstrap/Container'
import Button from 'react-bootstrap/Button'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
import NavDropdown from 'react-bootstrap/NavDropdown'

import { proxy } from 'comlink'
import { useTranslation, Trans } from 'react-i18next'

import { pki as forgePki } from '@dugrema/node-forge'

import { setupWorkers, cleanupWorkers } from './workers/workers.load'

import { 
    ModalAttente,
    LayoutMillegrilles, Menu as MenuMillegrilles, DropDownLanguage, ModalInfo,
    usagerDao, 
} from '@dugrema/millegrilles.reactjs'

import i18n from './i18n'

import { forgecommon, ModalErreur, initI18n } from '@dugrema/millegrilles.reactjs'

// Importer JS global
import 'react-bootstrap/dist/react-bootstrap.min.js'

// Importer cascade CSS global
import 'bootstrap/dist/css/bootstrap.min.css'
import 'font-awesome/css/font-awesome.min.css'
import '@dugrema/millegrilles.reactjs/dist/index.css'

import manifest from './manifest.build'

import './index.scss'
import './App.css'

// Wire i18n dans module @dugrema/millegrilles.reactjs
initI18n(i18n)

const PreAuthentifier = lazy( () => import('./PreAuthentifier') )
const Accueil = lazy( () => import('./Accueil') )
const SectionActiverDelegation = lazy( () => import('./ActiverDelegation') )
const SectionActiverCompte = lazy( () => import('./ActiverCompte') )
const SectionAjouterMethode = lazy( () => import('./AjouterMethode') )

const LOGGING = false  // Screen logging, pour debugger sur mobile

function App(_props) {

    const { t, i18n } = useTranslation()

    // Callbacks worker connexion, permet de connaitre l'etat du worker
    const [workers, setWorkers] = useState('')
    const [etatConnexion, setEtatConnexion] = useState(false)
    const [formatteurPret, setFormatteurPret] = useState(false)
    const [usagerSessionActive, setUsagerSessionActive] = useState('')

    // Etat usager
    const [idmg, setIdmg] = useState('')
    const [usagerDbLocal, setUsagerDbLocal] = useState('')
    const [resultatAuthentificationUsager, setResultatAuthentificationUsager] = useState('')
    const [sectionAfficher, setSectionAfficher] = useState('')
    const [usagerExtensions, setUsagerExtensions] = useState('')

    // Messages, erreurs
    const [attente, setAttente] = useState(false)
    const [error, setError] = useState('')
    const erreurCb = useCallback((err, message)=>{
        console.error("Erreur ", err)
        setError({err, message})
    }, [setError])
    const handlerCloseErreur = () => setError('')

    // Troubleshooting (log sur ecran, e.g. pour appareils mobiles)
    const [logEvent, setLogEvent] = useState('')
    const [logEvents, setLogEvents] = useState([])
    const appendLog = useCallback(event=>{ if(LOGGING) {console.trace(event); setLogEvent(event);} }, [setLogEvent])
    const resetLog = useCallback(()=>setLogEvents([]), [setLogEvents])
    
    useEffect(()=>{
        if(LOGGING && logEvent) { setLogEvent(''); setLogEvents([...logEvents, logEvent]); }
    }, [logEvent, setLogEvent, logEvents, setLogEvents])
    useEffect(()=>{appendLog(`Etat connexion : ${etatConnexion}, usager: "${''+usagerDbLocal}"`)}, [appendLog, etatConnexion, usagerDbLocal])

    useEffect(()=>{
        if(!usagerDbLocal) return setUsagerExtensions('')
        const certificat = usagerDbLocal.certificat
        if(!certificat) return setUsagerExtensions('')
        const certificatForge = forgePki.certificateFromPem(certificat)
        const extensions = forgecommon.extraireExtensionsMillegrille(certificatForge)
        setUsagerExtensions(extensions)
    }, [usagerDbLocal, setUsagerExtensions])

    useEffect(()=>{
        // console.info("Initialiser web workers")
        const workerInstances = initialiserWorkers(setUsagerSessionActive, setEtatConnexion, setFormatteurPret, appendLog)
        const handlerDeconnecter = () => {
            console.info("Cleanup web workers"); 
            cleanupWorkers(workerInstances)
        }

        // Init usager dao (requis par workers)
        usagerDao.init()
            .then(()=>{
                // usagerDao pret, on set les workers pour activer toutes les fonctions de la page
                const workers = Object.keys(workerInstances).reduce((acc, item)=>{
                    acc[item] = workerInstances[item].proxy
                    return acc
                }, {})
                setWorkers(workers)
                window.addEventListener('unload', handlerDeconnecter, true)
            })
            .catch(err=>erreurCb(err, "Erreur chargement usager dao"))

        return () => { 
            window.removeEventListener('unload', handlerDeconnecter, true)
            handlerDeconnecter()
        }
    }, [setWorkers, setUsagerSessionActive, setEtatConnexion, setFormatteurPret, appendLog, erreurCb])

    // Connecter a socket.io une fois les workers prets
    useEffect(()=>{
        if(!workers) return
        connecterSocketIo(workers, erreurCb, appendLog, setIdmg).catch(err=>erreurCb(err))
    }, [workers, erreurCb, appendLog, setIdmg])

    // Load/reload du formatteur de message sur changement de certificat
    useEffect(()=>{
        if(!workers) return
        if(usagerDbLocal) {
            // console.debug("App Charger formatteur pour usager ", usagerDbLocal)
            chargerFormatteurCertificat(workers, usagerDbLocal)
                .then(pret=>setFormatteurPret(pret))
                .catch(err=>{
                    setFormatteurPret(false)
                    erreurCb(err)
                })
        } else {
            workers.connexion.clearFormatteurMessage().catch(err=>erreurCb(err))
        }
    }, [workers, usagerDbLocal, setFormatteurPret, erreurCb])

    // Reception nouveau certificat
    useEffect(()=>{
        if(resultatAuthentificationUsager) {
            // console.debug("App resultatAuthentificationUsager ", resultatAuthentificationUsager)
            const {nomUsager, certificat, delegations_date, delegations_version} = resultatAuthentificationUsager
            if(nomUsager && certificat) {
                import('./comptesUtil').then(async comptesUtil=>{
                    // console.debug("Nouveau certificat recu, on va le sauvegarder")
                    const usagerDbLocal = await usagerDao.getUsager(nomUsager)
                    // Remplacer clePriveePem et fingerprintPk
                    const { clePriveePem, fingerprintPk } = usagerDbLocal.requete

                    await comptesUtil.sauvegarderCertificatPem(
                        nomUsager, 
                        certificat, 
                        {requete: null, clePriveePem, fingerprintPk, delegations_date, delegations_version}
                    )

                    // Reload usager (trigger reload formatteurMessages)
                    const usagerReloade = await usagerDao.getUsager(nomUsager)
                    // console.debug("Set usagerDb local - forcer login ", usagerReloade)
                    setUsagerDbLocal(usagerReloade)

                    const reponse = await workers.connexion.authentifier()
                    // console.debug("Reponse authentifier certificat : %O", reponse)
                    setResultatAuthentificationUsager(reponse)
                })
                .catch(err=>erreurCb(err))
            }
        }
    }, [workers, resultatAuthentificationUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb])

    const menu = (
        <MenuApp 
            i18n={i18n} 
            etatConnexion={etatConnexion} 
            idmg={idmg}
            workers={workers} 
            setSectionAfficher={setSectionAfficher} />
    ) 

    return (
        <LayoutMillegrilles menu={menu}>

            <Container className="contenu">

                <Suspense fallback={<Attente workers={workers} idmg={idmg} etatConnexion={etatConnexion} />}>
                    <p></p>
                    <Contenu 
                        workers={workers} 
                        usagerDbLocal={usagerDbLocal}
                        usagerExtensions={usagerExtensions}
                        setUsagerDbLocal={setUsagerDbLocal}
                        etatConnexion={etatConnexion}
                        formatteurPret={formatteurPret}
                        resultatAuthentificationUsager={resultatAuthentificationUsager}
                        setResultatAuthentificationUsager={setResultatAuthentificationUsager}
                        usagerSessionActive={usagerSessionActive}
                        setUsagerSessionActive={setUsagerSessionActive}
                        erreurCb={erreurCb}
                        sectionAfficher={sectionAfficher}
                        setSectionAfficher={setSectionAfficher}
                    />
                </Suspense>

                <Log log={logEvents} resetLog={resetLog} />

            </Container>

            <ModalAttente show={attente} setAttente={setAttente} />
            <ModalErreur show={!!error} err={error.err} message={error.message} titre={t('Erreur.titre')} fermer={handlerCloseErreur} />

        </LayoutMillegrilles>
    )
}

export default App

function Attente(_props) {
    return (
        <div>
            <p className="titleinit">Preparation de la MilleGrille</p>
            <p>Veuillez patienter durant le chargement de la page.</p>
            <ol>
                <li>Initialisation</li>
                <li>Chargement des composants dynamiques</li>
                <li>Connexion a la page</li>
            </ol>
        </div>
    )
}

function MenuApp(props) {

    const { i18n, etatConnexion, idmg } = props

    const { t } = useTranslation()
    const [showModalInfo, setShowModalInfo] = useState(false)
    const handlerCloseModalInfo = useCallback(()=>setShowModalInfo(false), [setShowModalInfo])

    const handlerSelect = eventKey => {
        switch(eventKey) {
            case 'applications': break
            case 'information': setShowModalInfo(true); break
            case 'deconnecter': window.location = '/millegrilles/authentification/fermer'; break
            default:
        }
    }

    const handlerChangerLangue = eventKey => {i18n.changeLanguage(eventKey)}
    const brand = (
        <Navbar.Brand>
            <Nav.Link title={t('titre')}>
                <Trans>titre</Trans>
            </Nav.Link>
        </Navbar.Brand>
    )

    return (
        <>
            <MenuMillegrilles brand={brand} labelMenu="Menu" etatConnexion={etatConnexion} onSelect={handlerSelect}>
                <Nav.Link eventKey="information" title="Afficher l'information systeme">
                    <Trans>menu.information</Trans>
                </Nav.Link>
                <DropDownLanguage title={t('menu.language')} onSelect={handlerChangerLangue}>
                    <NavDropdown.Item eventKey="en-US">English</NavDropdown.Item>
                    <NavDropdown.Item eventKey="fr-CA">Francais</NavDropdown.Item>
                </DropDownLanguage>
                <Nav.Link eventKey="deconnecter" title={t('deconnecter')}>
                    <Trans>menu.deconnecter</Trans>
                </Nav.Link>
            </MenuMillegrilles>
            <ModalInfo 
                show={showModalInfo} 
                fermer={handlerCloseModalInfo} 
                manifest={manifest} 
                idmg={idmg} />
        </>
    )
}


function Contenu(props) {
    const { 
        workers, sectionAfficher, etatConnexion, usagerDbLocal, usagerSessionActive,
        resultatAuthentificationUsager, 
        setResultatAuthentificationUsager, setSectionAfficher, setUsagerDbLocal,
        formatteurPret, erreurCb 
    } = props
    const { connexion } = workers
    const usagerAuthentifieOk = resultatAuthentificationUsager && resultatAuthentificationUsager.authentifie === true

    // Utilise pour indiquer qu'on peut reconnecter les listeners, refaire requetes, etc.
    // console.debug("Contenu proppies : ", props)
    const etatAuthentifie = (etatConnexion && usagerSessionActive && usagerDbLocal && formatteurPret && usagerAuthentifieOk)?true:false

    // Flag pour conserver l'etat "authentifie" lors d'une perte de connexion
    const [connexionPerdue, setConnexionPerdue] = useState(false)
    const [infoUsagerBackend, setInfoUsagerBackend] = useState('')

    const handleFermerSection = useCallback(()=>setSectionAfficher(''), [setSectionAfficher])

    // Re-authentification de l'usager si socket perdu
    useEffect(()=>{
        if(etatConnexion === true && usagerSessionActive && formatteurPret) {
            console.warn("Re-authentifier l'usager suite a une deconnexion")
            reauthentifier(connexion, usagerSessionActive, setResultatAuthentificationUsager, erreurCb)
                .then(()=>{setConnexionPerdue(false)})
                .catch(err=>erreurCb(err))
        }
    }, [
        connexion, usagerSessionActive, usagerAuthentifieOk, etatConnexion, formatteurPret,
        setResultatAuthentificationUsager, erreurCb, 
    ])

    // Retirer preuve d'authentification si on perd la connexion
    // Permet de forcer une re-authentification (pour evenements, etc.)
    useEffect(()=>{
        if(!etatConnexion && usagerAuthentifieOk === true) {
            console.warn("Connexion perdue")
            setConnexionPerdue(true)
            setResultatAuthentificationUsager('')
        }
    }, [etatConnexion, usagerAuthentifieOk, setConnexionPerdue, setResultatAuthentificationUsager])

    useEffect(()=>{
        // console.debug("Contenu useEffect etatAuthentifie %O, connexion %O, usagerDbLocal %O", etatAuthentifie, connexion, usagerDbLocal)
        if(etatAuthentifie !== true || !connexion || !usagerDbLocal) return
        // console.debug("Contenu Nouvelle requete chargerCompteUsager")
        // Charge le compte usager (via userId du certificat)
        connexion.chargerCompteUsager()
            .then(infoUsagerBackend=>{
                // console.debug("Contenu infoUsagerBackend charge : ", infoUsagerBackend)
                setInfoUsagerBackend(infoUsagerBackend)
            })
            .catch(err=>{
                console.error("Contenu Erreur chargerCompteUsager : %O", err)
                erreurCb(err)
            })
    }, [usagerDbLocal, etatAuthentifie, connexion, setInfoUsagerBackend, erreurCb])

    if(!props.workers) return <Attente {...props} />

    // Selection de la page a afficher
    let Page = PreAuthentifier
    if(usagerAuthentifieOk || connexionPerdue) {
        switch(sectionAfficher) {
            // case 'GestionCompte': Page = GestionCompte; break
            case 'SectionActiverDelegation': Page = SectionActiverDelegation; break
            case 'SectionActiverCompte': Page = SectionActiverCompte; break
            case 'SectionAjouterMethode': Page = SectionAjouterMethode; break
            default: Page = Accueil
        }
    }
  
    return (
        <Page {...props} 
            etatAuthentifie={etatAuthentifie} 
            infoUsagerBackend={infoUsagerBackend} 
            fermer={handleFermerSection} 
            setInfoUsagerBackend={setInfoUsagerBackend} 
            setUsagerDbLocal={setUsagerDbLocal}
            resultatAuthentificationUsager={resultatAuthentificationUsager} />
    )
}

// Utiliser pour reauthentifier l'usager avec son certificat apres une connexion perdue (et session active)
async function reauthentifier(connexion, nomUsager, setResultatAuthentificationUsager, erreurCb) {
    
    const infoUsager = await connexion.getInfoUsager(nomUsager)
    // console.debug("Info usager reauthentifier : %O", infoUsager)
    const { challengeCertificat } = infoUsager
    try {
        const reponse = await connexion.authentifierCertificat(challengeCertificat)
        // console.debug("Reponse authentifier certificat : %O", reponse)
        await setResultatAuthentificationUsager(reponse)
    } catch(err) {
        erreurCb(err, 'Erreur de connexion (authentification du certificat refusee)')
    }
}

function Log(props) {
    if(!LOGGING) return ''
    return (
        <div className="log">
            <h2>Log</h2>
            <div><Button onClick={props.resetLog}>Clear log</Button></div>
            <ol>
                {props.log.map((item, idx)=>(
                    <li key={idx}>{item}</li>
                ))}
            </ol>
        </div>
    )
}

function initialiserWorkers(setUsager, setEtatConnexion, setFormatteurPret, appendLog) {
    // Initialiser une seule fois
    appendLog("initialiserWorkers() Importer workers.load")

    // console.debug("Initialiser connexion worker")
    appendLog("Initialiser connexion worker")

    const { connexion } = setupWorkers()
    // Conserver reference globale vers les workers/instances
    const connexionWorker = connexion.proxy

    new Promise(async resolve => {
        // const {proxy} = await import('comlink')

        // Wiring callbacks avec comlink (web workers)
        const setEtatConnexionProxy = proxy(setEtatConnexion),
            setUsagerProxy = proxy(setUsager),
            setFormatteurPretProxy = proxy(setFormatteurPret)
        await connexionWorker.setCallbacks(setEtatConnexionProxy, setUsagerProxy, setFormatteurPretProxy)

        appendLog("Verifier fonctionnement connexion worker")
        const actif = await connexionWorker.ping()
        appendLog(`Connexion worker ok, reponse actif : ${''+actif}`)

        appendLog("Workers initialises")

        resolve()
    }).catch(err=>console.error("Erreur wiring callbacks workers : %O", err))

    return { connexion }
}

async function connecterSocketIo(workers, erreurCb, appendLog, setIdmg) {
    const {connexion} = workers
    if(!connexion) throw new Error("Connexion worker n'est pas initialise")
    
    // S'assurer que la session est creee - attendre reponse
  
    // Note : connexion socket.io est pure wss, on n'a pas de piggy-back pour
    //        recuperer le cookie de session.
  
    // Initialiser une premiere connexion via https pour permettre au navigateur
    // de recuperer le cookie de session.
    appendLog("Verifier session")
    await verifierSession(appendLog, erreurCb)
  
    const socketLocation = new URL(window.location.href)
    appendLog(`Session verifiee, connecter socketIo a ${socketLocation.href}`)
  
    const actif = await connexion.estActif()
    // console.debug("actif : %O", actif)
    appendLog(`connexionWorkers.estActif(): "${''+actif}"`)
  
    const infoIdmg = await connexion.connecter({location: socketLocation.href})
        .catch(err=>{
            if(err.socketOk) {
                appendLog("connecterSocketIo invoque sur socket deja ouvert")
            } else {
                erreurCb(err)
            }
        })

    // console.debug("Connexion socket.io completee, info idmg : %O", infoIdmg)
    if(infoIdmg) {
        const { idmg } = infoIdmg
        appendLog(`Connexion socket.io completee, info idmg ${infoIdmg.idmg}`)
        if(idmg) setIdmg(idmg)
        // setConnecte(true)

        // if(nomUsager) {
        //     // console.debug("Usager deja authentifie (session active) : %s", nomUsager)
        //     setUsagerSessionActive(nomUsager)
        //     // const usagerDbLocal = await usagerDao.getUsager(nomUsager)
        //     // setUsagerDbLocal(usagerDbLocal)
        // }
    } else {
        appendLog('Connexion socket.io completee, aucune info idmg')
    }
  
}

async function deconnecter(workers) {
    console.debug("deconnecter unload handler pour %O", workers)
    const { connexion } = workers
    if(connexion) connexion.deconnecter().catch(err=>console.warning("Erreur deconnexion sur unload"))
}

async function verifierSession(appendLog, erreurCb) {
    /* Verifier l'etat de la session usager. Va aussi creer le cookie de session
       (au besoin). Requis avant la connexion socket.io. */
    if(appendLog) appendLog("Verifier session")
    const { default: axios } = await import('axios')
    if(appendLog) appendLog("Axios charge")
    try {
        const reponseUser = await axios({method: 'GET', url: '/millegrilles/authentification/verifier'})
        const headers = reponseUser.headers
        const userId = headers['x-user-id']
        const nomUsager = headers['x-user-name']
        appendLog(`Info session userId: ${userId}, nomUsager: ${nomUsager}`)
        return {userId, nomUsager}
    } catch(err) {
        if(err.isAxiosError && err.response.status === 401) { return false }
        appendLog(`Erreur verification session usager : ${''+err}`)
        // erreurCb(err, 'Erreur acces au serveur')
        console.warn("Erreur d'acces au serveur : %O", err)
        return false
    }
}

async function chargerFormatteurCertificat(workers, usager) {
    // console.debug("Preparer formatteur de messages pour usager %O", usager)
    const connexion = workers.connexion
    const { certificat, clePriveePem } = usager
    if(connexion && certificat && clePriveePem) {
        await connexion.initialiserFormatteurMessage(certificat, clePriveePem)
        return true
    } else {
        await connexion.clearFormatteurMessage()
        return false
    }
}
