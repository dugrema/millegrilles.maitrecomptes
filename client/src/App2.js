import { lazy, useState, useCallback, useMemo, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import Alert from 'react-bootstrap/Alert'
import Container from 'react-bootstrap/Container'

import i18n from './i18n'

import { ModalAttente, LayoutMillegrilles, ModalErreur, initI18n, ErrorBoundary } from '@dugrema/millegrilles.reactjs'
import useWorkers, { useEtatConnexion, WorkerProvider, useEtatPret, useEtatSessionActive, useUsagerDb, useUsagerSocketIo } from './WorkerContext'

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

    const [erreurInit, setErreurInit] = useState(false)

    useEffect(()=>{
        // Maj splash/loading screen
        document.getElementById('splash_init3').className = ''
    }, [])

    return (
      <WorkerProvider setErr={setErreurInit} attente={<Attente err={erreurInit} />}>
        <ErrorBoundary errorCb={setErreurInit} >
          <Suspense fallback={<Attente2 />}>
            <AppTop />
          </Suspense>
        </ErrorBoundary>
      </WorkerProvider>
    )
  
}
export default App

function AppTop(_props) {

    const { t, i18n } = useTranslation()

    const [sectionAfficher, setSectionAfficher] = useState('')

    // Messages, erreurs
    const [attente, setAttente] = useState(false)

    const [confirmation, setConfirmation] = useState('')
    const confirmationCb = useCallback(message => {
        console.debug("Confirmation : ", message)
        setConfirmation(message)
    }, [setConfirmation])
    const handlerCloseConfirmation = () => setConfirmation('')

    const [error, setError] = useState('')
    const erreurCb = useCallback((err, message)=>{
        console.error("Erreur ", err)
        setError({err, message})
    }, [setError])
    const handlerCloseErreur = () => setError('')

    useEffect(()=>{
        console.debug("Section afficher : %O", sectionAfficher)

        if(sectionAfficher) {
            // OK
        } else {
            // On attend d'avoir une section a afficher pour l'usager
            return  
        }
        // Switch les div splash/root de public.html
        // N'a pas d'effet si connexion perdue/recuperee
        const splash = document.getElementById('splash'),
        root = document.getElementById('root')

        splash.className = 'splash hide'
        root.className = 'root'
    }, [sectionAfficher])

    const menu = (
        <MenuApp 
            i18n={i18n} 
            setSectionAfficher={setSectionAfficher} />
    ) 

    return (
        <Suspense fallback={<Attente2 />}>
            <LayoutMillegrilles menu={menu}>

                <Alert variant="success" show={confirmation?true:false} onClose={handlerCloseConfirmation} dismissible>
                    <Alert.Heading showButton>Confirmation</Alert.Heading>
                    <p>{confirmation}</p>
                </Alert>

                <Container className="contenu">

                    <Contenu 
                        confirmationCb={confirmationCb}
                        erreurCb={erreurCb}
                        sectionAfficher={sectionAfficher}
                        setSectionAfficher={setSectionAfficher}
                    />

                </Container>

                <ModalAttente show={attente} setAttente={setAttente} />
                <ModalErreur show={!!error} err={error.err} message={error.message} titre={t('Erreur.titre')} fermer={handlerCloseErreur} />

            </LayoutMillegrilles>
        </Suspense>
    )
}

function Attente(props) {
    const { err } = props

    return (
        <div>
            <div className="navinit">
                <nav>
                    <span>MilleGrilles</span>
                </nav>
            </div>
    
            <p className="titleinit">Preparation de la MilleGrille</p>
            <p>Veuillez patienter durant le chargement de la page.</p>
            <ol>
                <li>Initialisation</li>
                <li>Chargement des composants dynamiques</li>
                <li>Connexion a la page</li>
            </ol>

            <AlertErreurInitialisation err={err} />
        </div>
    )
}

function Attente2(_props) {
    const etatConnexion = useEtatConnexion()

    return (
        <div>
            <div className="navinit">
                <nav>
                    <span>MilleGrilles</span>
                </nav>
            </div>
    
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

function AlertErreurInitialisation(props) {
    const { err } = props

    return (
        <Alert variant="warning" show={err?true:false}>
            <Alert.Heading>Erreur de connexion</Alert.Heading>
            <p>
                La connexion au serveur a echoue. L'erreur est temporaire, veuillez ressayer plus tard.
            </p>
            <h4>Detail</h4>
            {err.message?<p>{err.message}</p>:''}
            <pre>{''+err.err}</pre>
        </Alert>
    )
}

function Contenu(props) {
    const { sectionAfficher, setSectionAfficher, confirmationCb, erreurCb } = props

    const workers = useWorkers()
    const etatPret = useEtatPret(),
          etatSessionActive = useEtatSessionActive()[0],
          [usagerDb, setUsagerDb] = useUsagerDb()
    const usagerSocketIo = useUsagerSocketIo()[0]

    const handleFermerSection = useCallback(()=>setSectionAfficher(''), [setSectionAfficher])

    // Fermer le splash screen
    useEffect(()=>{
        if(etatSessionActive !== null && !sectionAfficher) setSectionAfficher(true)
    }, [etatSessionActive, sectionAfficher])

    // Charger usager si la session est detectee via socket.io
    useEffect(()=>{
        if(etatSessionActive === true) {
            // S'assurer de charger l'information DB
            if(!usagerDb && usagerSocketIo) {
                console.debug("Usager socket io %O", usagerSocketIo)
                const nomUsager = usagerSocketIo.nomUsager
                workers.usagerDao.getUsager(nomUsager)
                    .then(usager=>{
                        console.debug("Usager DB charge : %O", usager)
                        setUsagerDb(usager)
                    })
                    .catch(err=>console.error("Contenu usagerDao.getUsager Erreur chargement %s : %O", nomUsager, err))
            }
        }
    }, [workers, etatSessionActive, usagerDb, setUsagerDb, usagerSocketIo])

    // Selection de la page a afficher
    const Page = useMemo(()=>{
        if(etatPret) {
            switch(sectionAfficher) {
                case 'SectionActiverDelegation': return SectionActiverDelegation
                case 'SectionActiverCompte': return SectionActiverCompte
                case 'SectionAjouterMethode': return SectionAjouterMethode
                default: 
                    setSectionAfficher('Accueil')  // Desactive splash/loading screen
                    return Accueil

            }
        }
        if(etatSessionActive === false) {
            // On a recu confirmation via socket.io que la session n'est pas active
            return PreAuthentifier
        }
        // L'information n'est pas encore complement disponible (e.g. socket.io pas connecte)
        return Attente2
    }, [sectionAfficher, etatSessionActive, etatPret])
  
    return (
        <Page
            fermer={handleFermerSection} 
            confirmationCb={confirmationCb}
            erreurCb={erreurCb} />
    )
}
