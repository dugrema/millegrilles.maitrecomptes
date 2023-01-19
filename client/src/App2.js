import { lazy, useState, useCallback, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import Container from 'react-bootstrap/Container'

import i18n from './i18n'

import { ModalAttente, LayoutMillegrilles, ModalErreur, initI18n } from '@dugrema/millegrilles.reactjs'
import useWorkers, {useEtatConnexion, WorkerProvider, useEtatPret, useInfoConnexion} from './WorkerContext'
import ErrorBoundary from './ErrorBoundary'

// Importer JS global
import 'react-bootstrap/dist/react-bootstrap.min.js'

// Importer cascade CSS global
import 'bootstrap/dist/css/bootstrap.min.css'
import 'font-awesome/css/font-awesome.min.css'
import '@dugrema/millegrilles.reactjs/dist/index.css'

import './index.scss'
import './App.css'

// Wire i18n dans module @dugrema/millegrilles.reactjs
initI18n(i18n)

const MenuApp = lazy( () => import('./Menu') )
const PreAuthentifier = lazy( () => import('./PreAuthentifier') )
const Accueil = lazy( () => import('./Accueil') )
const SectionActiverDelegation = lazy( () => import('./ActiverDelegation') )
const SectionActiverCompte = lazy( () => import('./ActiverCompte') )
const SectionAjouterMethode = lazy( () => import('./AjouterMethode') )

function App() {
  
    return (
      <WorkerProvider attente={<Attente />}>
        <ErrorBoundary>
          <Suspense fallback={<Attente />}>
            <AppTop />
          </Suspense>
        </ErrorBoundary>
      </WorkerProvider>
    )
  
}
export default App

function AppTop(_props) {

    const { t, i18n } = useTranslation()

    const workers = useWorkers()
    const etatConnexion = useEtatConnexion()
    const infoConnexion = useInfoConnexion()

    // Callbacks worker connexion, permet de connaitre l'etat du worker
    const [usagerSessionActive, setUsagerSessionActive] = useState('')

    // Etat usager
    // const [usagerDbLocal, setUsagerDbLocal] = useState('')
    const [resultatAuthentificationUsager, setResultatAuthentificationUsager] = useState('')
    const [sectionAfficher, setSectionAfficher] = useState('')
    // const [usagerExtensions, setUsagerExtensions] = useState('')

    // Messages, erreurs
    const [attente, setAttente] = useState(false)
    const [error, setError] = useState('')
    const erreurCb = useCallback((err, message)=>{
        console.error("Erreur ", err)
        setError({err, message})
    }, [setError])
    const handlerCloseErreur = () => setError('')

    // Reception nouveau certificat
    // useEffect(()=>{
    //     if(resultatAuthentificationUsager) {
    //         // console.debug("App resultatAuthentificationUsager ", resultatAuthentificationUsager)
    //         const {nomUsager, certificat, delegations_date, delegations_version} = resultatAuthentificationUsager
    //         if(nomUsager && certificat) {
    //             import('./comptesUtil').then(async comptesUtil=>{
    //                 // console.debug("Nouveau certificat recu, on va le sauvegarder")
    //                 const usagerDbLocal = await usagerDao.getUsager(nomUsager)
    //                 // Remplacer clePriveePem et fingerprintPk
    //                 const { clePriveePem, fingerprintPk } = usagerDbLocal.requete

    //                 await comptesUtil.sauvegarderCertificatPem(
    //                     nomUsager, 
    //                     certificat, 
    //                     {requete: null, clePriveePem, fingerprintPk, delegations_date, delegations_version}
    //                 )

    //                 // Reload usager (trigger reload formatteurMessages)
    //                 const usagerReloade = await usagerDao.getUsager(nomUsager)
    //                 // console.debug("Set usagerDb local - forcer login ", usagerReloade)
    //                 setUsagerDbLocal(usagerReloade)

    //                 const reponse = await workers.connexion.authentifier()
    //                 // console.debug("Reponse authentifier certificat : %O", reponse)
    //                 setResultatAuthentificationUsager(reponse)
    //             })
    //             .catch(err=>erreurCb(err))
    //         }
    //     }
    // }, [workers, resultatAuthentificationUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb])

    const menu = (
        <MenuApp 
            i18n={i18n} 
            etatConnexion={etatConnexion} 
            idmg={infoConnexion.idmg}
            workers={workers} 
            setSectionAfficher={setSectionAfficher} />
    ) 

    return (
        <LayoutMillegrilles menu={menu}>

            <Container className="contenu">

                <Suspense fallback={<Attente2 />}>
                    <Contenu 
                        setResultatAuthentificationUsager={setResultatAuthentificationUsager}
                        resultatAuthentificationUsager={resultatAuthentificationUsager}
                        erreurCb={erreurCb}
                        sectionAfficher={sectionAfficher}
                        setSectionAfficher={setSectionAfficher}
                    />
                </Suspense>

            </Container>

            <ModalAttente show={attente} setAttente={setAttente} />
            <ModalErreur show={!!error} err={error.err} message={error.message} titre={t('Erreur.titre')} fermer={handlerCloseErreur} />

        </LayoutMillegrilles>
    )
}

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

function Attente2(_props) {

    const etatConnexion = useEtatConnexion()

    console.debug("Attente2 etatConnexion ", etatConnexion)

    return (
        <div>
            <p className="titleinit">Preparation de la MilleGrille</p>
            <p>Veuillez patienter durant le chargement de la page.</p>
            <ol>
                <li>Initialisation</li>
                <li>Chargement des composants dynamiques</li>
                <li>Connexion a la page</li>
                {etatConnexion?<li>Connecte</li>:''}
            </ol>
        </div>
    )
}

function Contenu(props) {
    const { 
        sectionAfficher, setSectionAfficher, 
        setResultatAuthentificationUsager,
        erreurCb, 
    } = props

    const workers = useWorkers()
    const etatPret = useEtatPret()
    const etatConnexion = useEtatConnexion()

    const { connexion } = workers

    // Flag pour conserver l'etat "authentifie" lors d'une perte de connexion
    const [connexionPerdue, setConnexionPerdue] = useState(false)
    const [infoUsagerBackend, setInfoUsagerBackend] = useState('')

    const handleFermerSection = useCallback(()=>setSectionAfficher(''), [setSectionAfficher])

    // // Retirer preuve d'authentification si on perd la connexion
    // // Permet de forcer une re-authentification (pour evenements, etc.)
    // useEffect(()=>{
    //     if(!etatConnexion && usagerAuthentifieOk === true) {
    //         console.warn("Connexion perdue")
    //         setConnexionPerdue(true)
    //         setResultatAuthentificationUsager('')
    //     }
    // }, [etatConnexion, usagerAuthentifieOk, setConnexionPerdue, setResultatAuthentificationUsager])

    // useEffect(()=>{
    //     // console.debug("Contenu useEffect etatAuthentifie %O, connexion %O, usagerDbLocal %O", etatAuthentifie, connexion, usagerDbLocal)
    //     if(etatPret !== true || !connexion || !usagerDbLocal) return
    //     // console.debug("Contenu Nouvelle requete chargerCompteUsager")
    //     // Charge le compte usager (via userId du certificat)
    //     connexion.chargerCompteUsager()
    //         .then(infoUsagerBackend=>{
    //             // console.debug("Contenu infoUsagerBackend charge : ", infoUsagerBackend)
    //             setInfoUsagerBackend(infoUsagerBackend)
    //         })
    //         .catch(err=>{
    //             console.error("Contenu Erreur chargerCompteUsager : %O", err)
    //             erreurCb(err)
    //         })
    // }, [usagerDbLocal, etatPret, connexion, setInfoUsagerBackend, erreurCb])

    if(!etatConnexion) return <Attente2 {...props} />

    // Selection de la page a afficher
    let Page = PreAuthentifier
    if(etatPret || connexionPerdue) {
        switch(sectionAfficher) {
            // case 'GestionCompte': Page = GestionCompte; break
            case 'SectionActiverDelegation': Page = SectionActiverDelegation; break
            case 'SectionActiverCompte': Page = SectionActiverCompte; break
            case 'SectionAjouterMethode': Page = SectionAjouterMethode; break
            default: Page = Accueil
        }
    }
  
    return (
        <Page
            // infoUsagerBackend={infoUsagerBackend} 
            fermer={handleFermerSection} 
            setResultatAuthentificationUsager={setResultatAuthentificationUsager}
            erreurCb={erreurCb}
            // setInfoUsagerBackend={setInfoUsagerBackend} 
            // setUsagerDbLocal={setUsagerDbLocal}
            // resultatAuthentificationUsager={resultatAuthentificationUsager} 
            />
    )
}

// // Utiliser pour reauthentifier l'usager avec son certificat apres une connexion perdue (et session active)
// async function reauthentifier(connexion, nomUsager, setResultatAuthentificationUsager, erreurCb) {
    
//     const infoUsager = await connexion.getInfoUsager(nomUsager)
//     // console.debug("Info usager reauthentifier : %O", infoUsager)
//     const { challengeCertificat } = infoUsager
//     try {
//         const reponse = await connexion.authentifierCertificat(challengeCertificat)
//         // console.debug("Reponse authentifier certificat : %O", reponse)
//         await setResultatAuthentificationUsager(reponse)
//     } catch(err) {
//         erreurCb(err, 'Erreur de connexion (authentification du certificat refusee)')
//     }
// }

// async function chargerFormatteurCertificat(workers, usager) {
//     // console.debug("Preparer formatteur de messages pour usager %O", usager)
//     const connexion = workers.connexion
//     const { certificat, clePriveePem } = usager
//     if(connexion && certificat && clePriveePem) {
//         await connexion.initialiserFormatteurMessage(certificat, clePriveePem)
//         return true
//     } else {
//         await connexion.clearFormatteurMessage()
//         return false
//     }
// }
