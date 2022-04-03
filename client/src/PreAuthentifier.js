import {useEffect, useState, useCallback} from 'react'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import { Trans, useTranslation } from 'react-i18next'

import { usagerDao } from '@dugrema/millegrilles.reactjs'
import { pki as forgePki } from '@dugrema/node-forge'

import { BoutonAuthentifierWebauthn } from './WebAuthn'

import { sauvegarderCertificatPem, genererCle } from './comptesUtil'

function PreAuthentifier(props) {
    
    const { 
        workers, erreurCb, usagerDbLocal, setUsagerDbLocal, setResultatAuthentificationUsager,
        formatteurPret, etatConnexion, usagerSessionActive, setUsagerSessionActive, 
    } = props

    const [listeUsagers, setListeUsagers] = useState('')
    const [nomUsager, setNomUsager] = useState(window.localStorage.getItem('usager')||'')
    const [nouvelUsager, setNouvelUsager] = useState(false)  // Flag pour bouton nouvel usager
    const [authentifier, setAuthentifier] = useState(false)  // Flag pour ecran inscrire/authentifier
    const [etatUsagerBackend, setEtatUsagerBackend] = useState('')  // Info compte backend
    const [attente, setAttente] = useState(false)

    useEffect(()=>{
        usagerDao.getListeUsagers()
            .then(usagers=>{
                if(usagers.length === 0) setNouvelUsager(true)
                setListeUsagers(usagers)
            })
            .catch(err=>erreurCb(err))
    }, [setListeUsagers, setNouvelUsager, erreurCb])

    let Etape = FormSelectionnerUsager
    if(authentifier && etatUsagerBackend && etatUsagerBackend.infoUsager) {
        if(etatUsagerBackend.infoUsager.compteUsager === false) Etape = InscrireUsager
        else Etape = Authentifier
    }

    return (
        <Row>
            <Col sm={1} md={2}></Col>
            <Col>
                <p>Acces prive pour les usagers de la millegrille</p>
                <Etape 
                    workers={workers}
                    etatConnexion={etatConnexion}
                    nouvelUsager={nouvelUsager}
                    setNouvelUsager={setNouvelUsager}
                    setAuthentifier={setAuthentifier}
                    attente={attente}
                    setAttente={setAttente}
                    nomUsager={nomUsager} 
                    setNomUsager={setNomUsager} 
                    listeUsagers={listeUsagers}
                    etatUsagerBackend={etatUsagerBackend}
                    setEtatUsagerBackend={setEtatUsagerBackend}
                    usagerDbLocal={usagerDbLocal}
                    setUsagerDbLocal={setUsagerDbLocal}
                    formatteurPret={formatteurPret}
                    setResultatAuthentificationUsager={setResultatAuthentificationUsager}
                    usagerSessionActive={usagerSessionActive}
                    setUsagerSessionActive={setUsagerSessionActive}
                    erreurCb={erreurCb}
                />
            </Col>
            <Col sm={1} md={2}></Col>
        </Row>
    )
}

export default PreAuthentifier

function FormSelectionnerUsager(props) {

    const {nouvelUsager} = props

    return (
        <Form.Group controlId="formNomUsager">
            <Form.Label><Trans>authentification.nomUsager</Trans></Form.Label>
            <InputSaisirNomUsager 
                disabled={!nouvelUsager} 
                {...props} />
            <InputAfficherListeUsagers 
                disabled={nouvelUsager} 
                {...props} />
            <BoutonsAuthentifier {...props} />
        </Form.Group>
    )
}

function InputSaisirNomUsager(props) {
    const {setNomUsager} = props

    const {t} = useTranslation()
   
    const changerNomUsager = useCallback(event=>setNomUsager(event.currentTarget.value), [setNomUsager])

    if(props.disabled) return ''

    return (
      <>
        <Form.Control
          type="text"
          placeholder={t('authentification.saisirNom')}
          value={props.nomUsager}
          onChange={changerNomUsager}
          disabled={props.attente} />
  
        <Form.Text className="text-muted">
          <Trans>authentification.instructions1</Trans>
        </Form.Text>
      </>
    )
}

function InputAfficherListeUsagers(props) {

    const {
        workers, etatConnexion, disabled, nomUsager, 
        listeUsagers, setNomUsager, setEtatUsagerBackend, setUsagerDbLocal, 
        setResultatAuthentificationUsager, setNouvelUsager, 
        erreurCb
    } = props

    const {t} = useTranslation()

    const onChangeUsager = useCallback(event=>{
        setEtatUsagerBackend('')
        setUsagerDbLocal('')
        setResultatAuthentificationUsager('')
        setNouvelUsager(false)

        setNomUsager(event.currentTarget.value)
    }, [setNomUsager, setEtatUsagerBackend, setUsagerDbLocal, setResultatAuthentificationUsager, setNouvelUsager])

    useEffect(()=>{
        if(!disabled && listeUsagers.length > 0) {
            if(listeUsagers.includes(nomUsager)) {
                // Rien a faire
            } else {
                const usagerLocal = window.localStorage.getItem('usager')
                if(listeUsagers.includes(usagerLocal)) {
                    setNomUsager(usagerLocal)
                } else {
                    setNomUsager(listeUsagers[0])
                }
            }
        }
    }, [disabled, nomUsager, setNomUsager, listeUsagers])

    useEffect(()=>{
        if(etatConnexion && !disabled && nomUsager) {
            // console.debug("Pre-charger le compte usager %s", nomUsager)
            preparerUsager(workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, erreurCb)
        }
    }, [disabled, etatConnexion, workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, erreurCb])

    if(disabled || !listeUsagers) return ''
  
    return (
        <>
            <Form.Select
                type="text"
                value={nomUsager}
                placeholder={t('authentification.saisirNom')}
                onChange={onChangeUsager}
                disabled={props.attente}>
        
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

function BoutonsAuthentifier(props) {

    const {
        workers, nomUsager, setNomUsager, nouvelUsager, setNouvelUsager, etatUsagerBackend, setEtatUsagerBackend, 
        usagerDbLocal, setUsagerDbLocal, usagerSessionActive, setAuthentifier, attente, setAttente, erreurCb, 
        setResultatAuthentificationUsager, 
    } = props
    const suivantDisabled = nomUsager?false:true

    const setNouvelUsagerCb = useCallback( () => {
        setNomUsager('')
        setEtatUsagerBackend('')
        setUsagerDbLocal('')
        setResultatAuthentificationUsager('')
        setNouvelUsager(true)
    }, [setNomUsager, setNouvelUsager, setEtatUsagerBackend, setUsagerDbLocal, setResultatAuthentificationUsager])
    const annulerCb = useCallback( () => setNouvelUsager(false), [setNouvelUsager])
    const suivantCb = useCallback(
        () => {
            if(nouvelUsager === true) {
                setAttente(true)
                preparerUsager(workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, erreurCb)
                    .then(()=>setAuthentifier(true))
                    .catch(err=>erreurCb(err))
                    .finally(()=>setAttente(false))
            } else {
                // Information deja chargee, on authentifie
                setAuthentifier(true)
            }
        }, 
        [workers, nouvelUsager, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, setAuthentifier, setAttente, erreurCb]
    )
    const onClickWebAuth = useCallback(resultat=>{
        setAuthentifier(true)
        setResultatAuthentificationUsager(resultat)
    }, [setAuthentifier, setResultatAuthentificationUsager])

    useEffect(()=>{
        if(usagerSessionActive) {
            // console.debug("Session active pour usager %s, on simule click sur Suivant")
            suivantCb()
        }
    }, [suivantCb, usagerSessionActive])

    let iconeSuivant = <i className="fa fa-arrow-right"/>
    if(attente) iconeSuivant = <i className="fa fa-spinner fa-spin fa-fw" />

    let boutonSuivant = <Button disabled={attente || suivantDisabled} onClick={suivantCb}>Suivant {iconeSuivant}</Button>

    // Verifier si on a au moins 1 credential enregistre avec webauthn
    const etatUsagerInfo = etatUsagerBackend.infoUsager || {},
          challengeWebauthn = etatUsagerInfo.challengeWebauthn || {},
          allowCredentials = challengeWebauthn.allowCredentials || {}
    if(allowCredentials.length > 0) {
        boutonSuivant = (
            <BoutonAuthentifierWebauthn
                workers={workers}
                challenge={etatUsagerBackend.infoUsager.challengeWebauthn}
                setAttente={setAttente}
                setResultatAuthentificationUsager={onClickWebAuth}
                erreurCb={erreurCb}
                usagerDbLocal={usagerDbLocal}
            >
                Suivant {iconeSuivant}
            </BoutonAuthentifierWebauthn>
        )
    }

    return (
        <Row>
            <Col className="button-list">

                {boutonSuivant}

                <Button variant="secondary" disabled={nouvelUsager} onClick={setNouvelUsagerCb}>
                    Nouveau
                </Button>

                <Button variant="secondary">
                    Options
                </Button>

                <Button variant="secondary" disabled={!nouvelUsager} onClick={annulerCb}>
                    <Trans>bouton.annuler</Trans>
                </Button>

            </Col>
        </Row>
    )
}

function InscrireUsager(props) {

    const {workers, setAuthentifier, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb} = props

    const onClickSuivant = useCallback( () => {
        suivantInscrire(workers, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb)
            .catch(err=>erreurCb(err))
    }, [workers, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb])
    const onClickAnnuler = useCallback( () => setAuthentifier(false), [setAuthentifier])

    return (
        <>
            <h2>Créer un nouveau compte</h2>

            <div className="boite-coinsronds boite-authentification">
                <p>Le compte <strong>{props.nomUsager}</strong> est disponible.</p>

                <p>
                    Pour le créer, veuillez cliquer sur le bouton Inscrire et
                    suivre les instructions.
                </p>

                <Row>
                    <Col className="button-list">
                        <Button onClick={onClickSuivant}>Inscrire <i className="fa fa-arrow-right"/></Button>
                        <Button variant="secondary" onClick={onClickAnnuler}>
                            <Trans>bouton.annuler</Trans>
                        </Button>
                    </Col>
                </Row>
            </div>
        </>
    )
}

function Authentifier(props) {

    const {
        workers, nouvelUsager, setAttente, 
        nomUsager, formatteurPret, usagerDbLocal, 
        setAuthentifier, etatUsagerBackend, setEtatUsagerBackend, 
        setResultatAuthentificationUsager, setUsagerSessionActive, 
        erreurCb
    } = props

    // Attendre que le formatteur (certificat) soit pret
    useEffect(()=>{
        // console.debug("Formatteur pret? %s, etat usager back-end : %O", formatteurPret, etatUsagerBackend)
        const { connexion } = workers
        if(formatteurPret && etatUsagerBackend) {
            // Authentifier
            const { challengeCertificat, methodesDisponibles } = etatUsagerBackend.infoUsager
            if(methodesDisponibles.includes('certificat')) {
                console.debug("Authentifier avec le certificat")
                connexion.authentifierCertificat(challengeCertificat)
                    .then(reponse=>{
                        // console.debug("Reponse authentifier certificat : %O", reponse)
                        setResultatAuthentificationUsager(reponse)
                    })
                    .catch(err=>{
                        erreurCb(err, 'Erreur de connexion (authentification du certificat refusee)')
                    })
            }
        } else if(formatteurPret === false && !usagerDbLocal.certificat) {
            // On a un certificat absent ou expire
            // console.info("Certificat absent")
        }
    }, [workers, formatteurPret, usagerDbLocal, etatUsagerBackend, setResultatAuthentificationUsager, erreurCb])

    // Conserver usager selectionne (pour reload ecran)
    useEffect(()=>window.localStorage.setItem('usager', nomUsager), [nomUsager])

    const annulerCb = useCallback(()=>{
        fermerSession(setAuthentifier, setEtatUsagerBackend, setUsagerSessionActive)
            .catch(err=>erreurCb(err))
    }, [setAuthentifier, setEtatUsagerBackend, setUsagerSessionActive, erreurCb])

    let message = <p>Ouverture d'une nouvelle session en cours ... <i className="fa fa-spinner fa-spin fa-fw" /></p>
    if(nouvelUsager) message = 'Cliquez sur Suivant pour vous connecter.'
    else if(!formatteurPret) message = 'Attente de preparation du certificat'

    return (
        <>
            <Alert variant="info">
                <Alert.Heading>Ouverture de session</Alert.Heading>
                
                {message}
            </Alert>

            <Row>
                    <Col className="button-list">

                    {nouvelUsager?
                        <BoutonAuthentifierWebauthn 
                            workers={workers}
                            challenge={etatUsagerBackend.infoUsager.challengeWebauthn}
                            setAttente={setAttente}
                            setResultatAuthentificationUsager={setResultatAuthentificationUsager}
                            erreurCb={erreurCb}
                            usagerDbLocal={usagerDbLocal}>
                            Suivant
                        </BoutonAuthentifierWebauthn>
                    :''}

                    <Button variant="secondary" onClick={annulerCb}>Annuler</Button>
                
                </Col>
            </Row>
        </>
    )
}

async function suivantInscrire(workers, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb) {
    console.debug("Inscrire")
    try {
        const {connexion} = workers
        const usagerInit = await initialiserCompteUsager(nomUsager)
        const requete = usagerInit.requete || {}
        const csr = requete.csr
 
        console.debug("Inscrire usager %s avec CSR navigateur\n%O", nomUsager, csr)
        const reponseInscription = await connexion.inscrireUsager(nomUsager, csr)
        console.debug("Reponse inscription : %O", reponseInscription)
      
        // Enregistrer le certificat dans IndexedDB
        const certificatChaine = reponseInscription.certificat
        console.debug("Certificats recus : cert: %O", certificatChaine)
        await sauvegarderCertificatPem(nomUsager, certificatChaine)
      
        // Recharger usager, applique le nouveau certificat
        const usagerDbLocal = await usagerDao.getUsager(nomUsager)
        setUsagerDbLocal(usagerDbLocal)

        // Conserver usager selectionne pour reload
        window.localStorage.setItem('usager', nomUsager)

        // Conserver information session
        setResultatAuthentificationUsager({
            ...reponseInscription, 
            authentifie: true, 
            nomUsager,
            // userId: '',
            // valide: true,
        })

    } catch(err) {
        console.error("Erreur inscrire usager : %O", err)
        erreurCb(err, "Erreur inscrire usager")
    }
}

async function preparerUsager(workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, erreurCb) {
    const connexion = workers.connexion
    // console.debug("Suivant avec usager %s", nomUsager)
    
    // Verifier etat du compte local. Creer ou regenerer certificat (si absent ou expire).
    let usagerLocal = await initialiserCompteUsager(nomUsager) 

    let fingerprintPk = null
    if(usagerLocal && usagerLocal.requete) {
        fingerprintPk = usagerLocal.requete.fingerprintPk
    }

    const etatUsagerBackend = await chargerUsager(connexion, nomUsager, fingerprintPk)
    setEtatUsagerBackend(etatUsagerBackend)
    setUsagerDbLocal(usagerLocal)
}

async function chargerUsager(connexion, nomUsager, fingerprintPk) {
    const infoUsager = await connexion.getInfoUsager(nomUsager, fingerprintPk)
    // Verifier si on peut faire un auto-login (seule methode === certificat)
    let authentifie = false
    return {infoUsager, authentifie}
}

// Initialiser le compte de l'usager
async function initialiserCompteUsager(nomUsager, opts) {
    if(!opts) opts = {}
  
    if( ! nomUsager ) throw new Error("Usager null")
  
    let usager = await usagerDao.getUsager(nomUsager)
    const certificat = usager?usager.certificat:null
    let genererCsr = false
  
    // console.debug("initialiserNavigateur Information usager initiale : %O", usager)
  
    if( !usager ) {
        // console.debug("Nouvel usager, initialiser compte et creer CSR %s", nomUsager)
        genererCsr = true
    } else if( opts.regenerer === true ) {
        // console.debug("Force generer un nouveau certificat")
        genererCsr = true
    } else if(!certificat && !usager.requete) {
        // console.debug("Certificat/CSR absent, generer nouveau certificat")
        genererCsr = true
    } else if(certificat) {
        // Verifier la validite du certificat
        const {certificatValide, canRenew} = verifierDateRenouvellementCertificat(certificat) 
        if(!certificatValide) {
            // Certificat expire. Retirer certificat/cle du compte
            await usagerDao.updateUsager(nomUsager, {nomUsager, certificat: null, clePriveePem: null, fingerprintPk: null})
            usager.certificat = null
            usager.clePriveePem = null
        }
        if( canRenew || !certificatValide ) {
            // Generer nouveau certificat
            console.debug("Certificat invalide ou date de renouvellement atteinte")
            genererCsr = true
        }
    }
  
    if(genererCsr) {
        const nouvellesCles = await genererCle(nomUsager)
        const {csr, clePriveePem, fingerprint_pk} = nouvellesCles
        const requete = {csr, clePriveePem, fingerprintPk: fingerprint_pk}
        await usagerDao.updateUsager(nomUsager, {nomUsager, requete})
        usager = {...usager, requete}
    }
  
    console.debug("Compte usager : %O", usager)
    return usager
}

function verifierDateRenouvellementCertificat(certificat) {
    // Verifier la validite du certificat
    const certForge = forgePki.certificateFromPem(certificat.join(''))
    
    const validityNotAfter = certForge.validity.notAfter.getTime(),
            validityNotBefore = certForge.validity.notBefore.getTime()
    const certificatValide = new Date().getTime() < validityNotAfter

    // Calculer 2/3 de la duree pour trigger de renouvellement
    const validityRenew = (validityNotAfter - validityNotBefore) / 3.0 * 2.0 + validityNotBefore
    const canRenew = new Date().getTime() > validityRenew

    // console.debug(
    //     "Certificat valide presentement : %s, epoch can renew? (%s) : %s (%s)",
    //     certificatValide, canRenew, validityRenew, new Date(validityRenew)
    // )

    return {certificatValide, canRenew}
}

async function fermerSession(setAuthentifier, setEtatUsagerBackend, setUsagerSessionActive) {
    const axios = await import('axios')
    try {
        await axios.get('/millegrilles/authentification/fermer')
    } catch(err) {
        console.warn("Erreur fermer session : %O", err)
    } finally {
        setAuthentifier(false)
        setEtatUsagerBackend(false)
        setUsagerSessionActive('')
    }

    try {
        await axios.get('/millegrilles/authentification/verifier')
    } catch(err) {
        const response = err.response || {}
        const status = response.status
        if(status === 401) {
            // Ok, session creee et usager n'est pas authentifie
        } else {
            console.error("Erreur verification session fermee : %O", response)
        }
    }
}
