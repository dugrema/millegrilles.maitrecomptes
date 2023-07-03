import { lazy, useState, useCallback, useMemo, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import Alert from 'react-bootstrap/Alert'
import Container from 'react-bootstrap/Container'

import i18n from './i18n'

import { ModalAttente, LayoutMillegrilles, ModalErreur, initI18n } from '@dugrema/millegrilles.reactjs'
import {useEtatConnexion, WorkerProvider, useEtatPret } from './WorkerContext'
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

    const [erreurInit, setErreurInit] = useState(false)

    return (
      <WorkerProvider setErr={setErreurInit} attente={<Attente err={erreurInit} />}>
        <ErrorBoundary>
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
    const [error, setError] = useState('')
    const erreurCb = useCallback((err, message)=>{
        console.error("Erreur ", err)
        setError({err, message})
    }, [setError])
    const handlerCloseErreur = () => setError('')

    const menu = (
        <MenuApp 
            i18n={i18n} 
            setSectionAfficher={setSectionAfficher} />
    ) 

    return (
        <LayoutMillegrilles menu={menu}>

            <Container className="contenu">

                <Suspense fallback={<Attente2 />}>
                    <Contenu 
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

function Attente(props) {
    const { err } = props

    return (
        <Container>
            <p className="titleinit">Preparation de la MilleGrille</p>
            <p>Veuillez patienter durant le chargement de la page.</p>
            <ol>
                <li>Initialisation</li>
                <li>Chargement des composants dynamiques</li>
                <li>Connexion a la page</li>
            </ol>

            <AlertErreurInitialisation err={err} />
        </Container>
    )
}

function Attente2(_props) {
    const etatConnexion = useEtatConnexion()

    return (
        <Container>
            <p className="titleinit">Preparation de la MilleGrille</p>
            <p>Veuillez patienter durant le chargement de la page.</p>
            <ol>
                <li>Initialisation</li>
                <li>Chargement des composants dynamiques</li>
                <li>Connexion a la page</li>
                {etatConnexion?<li>Connecte</li>:''}
            </ol>
        </Container>
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
    const { sectionAfficher, setSectionAfficher, erreurCb } = props

    const etatPret = useEtatPret()
    const etatConnexion = useEtatConnexion()

    const handleFermerSection = useCallback(()=>setSectionAfficher(''), [setSectionAfficher])

    // Selection de la page a afficher
    const Page = useMemo(()=>{
        if(etatPret) {
            switch(sectionAfficher) {
                case 'SectionActiverDelegation': return SectionActiverDelegation
                case 'SectionActiverCompte': return SectionActiverCompte
                case 'SectionAjouterMethode': return SectionAjouterMethode
                default: return Accueil
            }
        }
        return PreAuthentifier
    }, [sectionAfficher, etatPret])
  
    if(!etatConnexion) return <Attente2 {...props} />

    return (
        <Page
            fermer={handleFermerSection} 
            erreurCb={erreurCb} />
    )
}
