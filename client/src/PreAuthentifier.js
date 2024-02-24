import {useEffect, useState, useCallback, useMemo, lazy} from 'react'

import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'

import { Trans, useTranslation } from 'react-i18next'

import { usagerDao, SelectDureeSession } from '@dugrema/millegrilles.reactjs'

import useWorkers, { useUsagerDb, useUsagerSocketIo, useUsagerWebAuth } from './WorkerContext'
import { BoutonAuthentifierWebauthn } from './WebAuthn'

import { preparerUsagerLocalDb, chargerUsager, sauvegarderUsagerMaj, verifierDateRenouvellementCertificat } from './comptesUtil'
import { setUsager as connecterUsager } from './workers/connecter'

const Authentifier = lazy( () => import('./Authentifier') )
const InscrireUsager = lazy( () => import('./InscrireUsager') )
const CompteRecovery = lazy( () => import('./CompteRecovery') )

const MODE_AUTHENTIFICATION_NOUVEL_USAGER = 1,
      MODE_AUTHENTIFICATION_SELECTIONNER = 2

/**
 * Page qui s'affiche si une session n'est pas deja active. Permet a l'usager de s'authentifier.
 * @param {*} props 
 * @returns 
 */
function PreAuthentifier(props) {
    const { erreurCb } = props

    const workers = useWorkers()

    const [usagerDb, setUsagerDb] = useUsagerDb()
    const setUsagerWebAuth = useUsagerWebAuth()[1]

    const [modeAuthentification, setModeAuthentification] = useState('')
    const [nomUsager, setNomUsager] = useState('')
    const [dureeSession, setDureeSession] = useState(window.localStorage.getItem('dureeSession')||'86400')
    const [compteRecovery, setCompteRecovery] = useState(false)

    // Flags
    const [authentifierFlag, setAuthentifierFlag] = useState(false)
    const [inscrireFlag, setInscrireFlag] = useState(false)
    const [attenteFlag, setAttenteFlag] = useState(false)

    const nouvelUsagerToggle = useCallback(()=>setModeAuthentification(MODE_AUTHENTIFICATION_NOUVEL_USAGER), [setModeAuthentification])
    const authentifierToggle = useCallback(()=>setAuthentifierFlag(true), [setAuthentifierFlag])
    const inscrireToggle = useCallback(()=>setInscrireFlag(true), [setInscrireFlag])
    const compteRecoveryToggle = useCallback(()=>setCompteRecovery(true), [setCompteRecovery])
    
    const annulerHandler = useCallback(()=>{
        setAuthentifierFlag(false)
        setInscrireFlag(false)
        setAttenteFlag(false)
    }, [setAuthentifierFlag, setInscrireFlag, setAttenteFlag])

    // Initialisation de la page
    useEffect(()=>{
        if(nomUsager || modeAuthentification !== '') return
        console.debug("Determiner le mode d'authentification initial")
        setAttenteFlag(true)
        determinerModeInitial(workers)
            .then(([modeInitial, nomUsager, usagerDb, usagerWebAuth])=>{
                console.debug("Mode initial %O, nomUsager %O, usagerDb %O, usagerWebAuth : %O", 
                    modeInitial, nomUsager, usagerDb, usagerWebAuth)
                setModeAuthentification(modeInitial)
                setUsagerWebAuth(usagerWebAuth)
                setUsagerDb(usagerDb)
                setNomUsager(nomUsager)
            })
            .catch(erreurCb)
            .finally(()=>setAttenteFlag(false))
    }, [workers, modeAuthentification, nomUsager, setAttenteFlag])

    // Changement d'usager
    useEffect(()=>{
        if(!nomUsager) return
        console.debug("Nom usager %s, usagerDb %O", nomUsager, usagerDb)
        if(!usagerDb || usagerDb.nomUsager !== nomUsager) {
            setAttenteFlag(true)
            traiterChangementUsager(workers, nomUsager)
                .then(resultat=>{
                    const usagerDb = resultat.usagerDb
                    const usagerWebAuth = resultat.usagerWebAuth
                    setUsagerWebAuth(usagerWebAuth)
                    setUsagerDb(usagerDb)
                })
                .catch(erreurCb)
                .finally(()=>setAttenteFlag(false))
        }
    }, [nomUsager, usagerDb, erreurCb])

    let Page = null

    if(authentifierFlag) {
        Page = Authentifier
    } else if(inscrireFlag) {
        Page = InscrireUsager
    } else if(compteRecovery) {
        Page = CompteRecovery
    } else {
        switch(modeAuthentification) {
            case MODE_AUTHENTIFICATION_NOUVEL_USAGER: Page = UsagerNouveau; break
            case MODE_AUTHENTIFICATION_SELECTIONNER: Page = UsagerWebauthn; break
            default: 
                Page = PageChargement
        }
    }

    // Layout
    return (
        <Layout>
            <Page 
                nomUsager={nomUsager}
                setNomUsager={setNomUsager}
                nouvelUsagerToggle={nouvelUsagerToggle}
                authentifierToggle={authentifierToggle}
                compteRecoveryToggle={compteRecoveryToggle}
                attenteFlag={attenteFlag}
                setAttenteFlag={setAttenteFlag}
                dureeSession={dureeSession}
                setDureeSession={setDureeSession}
                annuler={annulerHandler}
                erreurCb={erreurCb} />
        </Layout>
    )
}

export default PreAuthentifier

function PageChargement(props) {
    return (
        <div>Chargement en cours ...</div>
    )
}

function UsagerNouveau(props) {

    const { 
        setNomUsager, 
        authentifierToggle, 
        attenteFlag, setAttenteFlag,
        dureeSession, setDureeSession,
        annuler, erreurCb,
    } = props

    const usagerDb = useUsagerDb[0],
          usagerWebAuth = useUsagerWebAuth[0]

    const peutActiver = useMemo(()=>detecterPeutActiver(usagerDb, usagerWebAuth), [usagerDb, usagerWebAuth])

    return (
        <Form.Group controlId="formNomUsager">
        <InputSaisirNomUsager 
            onChange={setNomUsager}
            attente={attenteFlag}
            setAttente={setAttenteFlag}
            setAuthentifier={authentifierToggle}
            peutActiver={peutActiver}
            dureeSession={dureeSession}
            setDureeSession={setDureeSession}
            annuler={annuler}
            erreurCb={erreurCb}
            />
        </Form.Group>
    )
}

function UsagerWebauthn(props) {

    const { 
        nomUsager, setNomUsager, 
        nouvelUsagerToggle, compteRecoveryToggle,
        attenteFlag, setAttenteFlag,
        erreurCb,
    } = props

    const [listeUsagers, setListeUsagers] = useState('')

    useEffect(()=>{
        usagerDao.getListeUsagers()
            .then(usagers=>{
                usagers.sort()  // Trier liste par nom
                console.debug("Liste usagers locaux (IDB) ", usagers)
                setListeUsagers(usagers)
            })
            .catch(erreurCb)
    }, [setListeUsagers, erreurCb])

    return (
        <Form.Group controlId="formNomUsager">
            <InputAfficherListeUsagers 
                nomUsager={nomUsager}
                setNomUsager={setNomUsager}
                setNouvelUsager={nouvelUsagerToggle} 
                attente={attenteFlag}
                setAttente={setAttenteFlag}
                // setAuthentifier={setAuthentifier}
                listeUsagers={listeUsagers}
                // peutActiver={peutActiver}
                // dureeSession={dureeSession}
                // setDureeSession={setDureeSession}
                setCompteRecovery={compteRecoveryToggle}
                erreurCb={erreurCb}
                />
        </Form.Group>        
    )
}

async function traiterChangementUsager(workers, nomUsager) {
    let usagerDb = await usagerDao.getUsager(nomUsager)
    let certificatValide = false
    if(usagerDb) {
        console.debug("traiterChangementUsager Usager %s present dans la DB : %O", nomUsager, usagerDb)

        // Determiner si on doit preparer une nouvelle requete de certificat (cas d'expiration)
        if(usagerDb.certificat) {
            const infoCertificat = verifierDateRenouvellementCertificat(usagerDb.certificat) 
            console.debug("traiterChangementUsager Certificat verifierDateRenouvellementCertificat : ", infoCertificat)
            certificatValide = infoCertificat.certificatValide
            if(!certificatValide) {
                console.debug("traiterChangementUsager Certificat expire, le retirer.")
                await usagerDao.updateUsager(nomUsager, {nomUsager, certificat: null})
            }
        }

    }

    if(!usagerDb || !certificatValide && !usagerDb.requete) {
        // Generer une nouvelle requete de certificat
        usagerDb = await preparerUsagerLocalDb(nomUsager)
        console.debug("traiterChangementUsager Nouveau certificat genere : ", usagerDb)
    }

    const requete = usagerDb.requete || {},
          fingerprintPk = requete.fingerprintPk,
          fingerprintCourant = usagerDb.fingerprintPk,
          certificat = usagerDb.certificat

    // Verifier si un nouveau certificat est disponible sur le serveur
    const reponseUsagerWebAuth = await chargerUsager(
        nomUsager, fingerprintPk, fingerprintCourant, {genererChallenge: true})
    console.debug("traiterChangementUsager SectionAuthentification Charge compte usager : %O", reponseUsagerWebAuth)
    const infoUsager = reponseUsagerWebAuth.infoUsager || {}

    let mode = MODE_AUTHENTIFICATION_NOUVEL_USAGER
    // Recuperer challenges, preparer authentification webauthn
    if(infoUsager.authentication_challenge) {
        mode = MODE_AUTHENTIFICATION_SELECTIONNER
    } 
    // Ajouter cas MODE_AUTHENTIFICATION_ACTIVATION_CERTIFICAT
    // else if(certificat && reponseUsagerWebAuth.generic_challenge && )
    
    return {mode, usagerDb, usagerWebAuth: reponseUsagerWebAuth}
}

async function determinerModeInitial(workers) {

    // Par defaut on utilise les parametres dans localStorage et mode nouvel usager
    // Ces valeurs vont etre modifiees en fonction de l'information recueillie sur le serveur
    let nomUsager = window.localStorage.getItem('usager')||''
    let modeInitial = MODE_AUTHENTIFICATION_NOUVEL_USAGER

    let usagerDb = null, usagerWebAuth = null

    if(nomUsager) {
        const resultat = await traiterChangementUsager(workers, nomUsager)
        modeInitial = resultat.mode
        usagerDb = resultat.usagerDb
        usagerWebAuth = resultat.usagerWebAuth
    }

    return [modeInitial, nomUsager, usagerDb, usagerWebAuth]
}

function detecterPeutActiver(usagerDb, usagerWebAuth) {
    return false  // TODO
}

function Layout(props) {
    return (
        <Row>
            <Col xs={0} sm={1} md={1} lg={2}></Col>
            <Col xs={12} sm={10} md={10} lg={8}>
                <p></p>
                {props.children}
            </Col>
        </Row>
    )
}

// function SectionAuthentification(props) {
//     const { erreurCb, nomUsager, setNomUsager, reloadCompteUsager } = props

//     const workers = useWorkers()
//     const [usagerDb, setUsagerDb] = useUsagerDb()
//     const [usagerWebAuth, setUsagerWebAuth] = useUsagerWebAuth()

//     const [dureeSession, setDureeSession] = useState(window.localStorage.getItem('dureeSession')||'86400')

//     // Flags
//     const [nouvelUsager, setNouvelUsager] = useState(false)  // Flag pour bouton nouvel usager
//     const [authentifier, setAuthentifier] = useState(false)  // Flag pour ecran inscrire/authentifier
//     const [attente, setAttente] = useState(false)
//     const [compteRecovery, setCompteRecovery] = useState(false)  // Mode pour utiliser un code pour associer compte

//     // Load/re-load usagerDbLocal et usagerWebAuth sur changement de nomUsager
//     useEffect(()=>{
//         if(!nomUsager) return

//         if(!usagerDb || usagerDb.nomUsager !== nomUsager) {
//             initialiserCompteUsager(nomUsager) 
//                 .then(async usagerLocal=>{
//                     setUsagerDb(usagerLocal)
//                     console.debug("SectionAuthentification initialiserCompteUsager usagerLocal : %O", usagerLocal)
//                     const requete = usagerLocal.requete || {},
//                           fingerprintPk = requete.fingerprintPk,
//                           fingerprintCourant = usagerLocal.fingerprintPk

//                     if(usagerLocal.certificat && usagerLocal.clePriveePem) {
//                         // Initialiser le formatteur de certificat - va permettre auth via activation
//                         await chargerFormatteurCertificat(workers, usagerLocal)
//                     } else {
//                         // Desactiver formatteur de certificat
//                         await chargerFormatteurCertificat(workers, {})
//                     }

//                     const reponseUsagerWebAuth = await chargerUsager(
//                         nomUsager, fingerprintPk, fingerprintCourant, {genererChallenge: true})
//                     console.debug("SectionAuthentification Charge compte usager : %O", reponseUsagerWebAuth)

//                     // Recuperer nouveau certificat
//                     if(usagerLocal.requete && reponseUsagerWebAuth.infoUsager && reponseUsagerWebAuth.infoUsager.certificat) {
//                         console.info("Nouveau certificat recu : %O", reponseUsagerWebAuth.infoUsager)
//                         // TODO : ajouter delegations_date, delegations_versions a la reponse webauth
//                         const reponse = {...reponseUsagerWebAuth.infoUsager, nomUsager}
//                         const usagerLocalMaj = await sauvegarderUsagerMaj(workers, reponse)
//                         // Reload le formatteur de messages avec le nouveau certificat
//                         await chargerFormatteurCertificat(workers, usagerLocalMaj)
//                     }

//                     setUsagerWebAuth(reponseUsagerWebAuth)
//                 })
//                 .catch(erreurCb)
//         }

//         return () => {
//             setUsagerWebAuth('')
//         }
//     }, [workers, nomUsager, usagerDb, setUsagerDb, setUsagerWebAuth, erreurCb])

//     if(compteRecovery) {
//         // Etape = CompteRecovery
//         return (
//             <CompteRecovery 
//                 setAuthentifier={setAuthentifier}
//                 setCompteRecovery={setCompteRecovery}
//                 reloadCompteUsager={reloadCompteUsager}
//                 erreurCb={erreurCb}
//                 />
//         )
//     }

//     if(authentifier && usagerWebAuth) {
//         console.debug("Authentifier avec : %O", usagerWebAuth)

//         if(usagerWebAuth.infoUsager) {
//             // C'est un usager existant, on poursuit l'authentification avec webauthn
//             return (
//                 <Authentifier 
//                     nouvelUsager={nouvelUsager}
//                     setAttente={setAttente}
//                     nomUsager={nomUsager}
//                     dureeSession={dureeSession}
//                     setAuthentifier={setAuthentifier}
//                     setCompteRecovery={setCompteRecovery}
//                     erreurCb={erreurCb}
//                     />
//             )

//         } else {
//             // Nouvel usager
//             return (
//                 <InscrireUsager 
//                     setAuthentifier={setAuthentifier}
//                     setNouvelUsager={setNouvelUsager}
//                     reloadCompteUsager={reloadCompteUsager}
//                     setNomUsager={setNomUsager}
//                     nomUsager={nomUsager}
//                     erreurCb={erreurCb}
//                     />
//             )
//         }

//     }

//     // Ecran de saisie du nom usager
//     return (
//         <FormSelectionnerUsager 
//             nomUsager={nomUsager}
//             setNomUsager={setNomUsager}
//             nouvelUsager={nouvelUsager}
//             setNouvelUsager={setNouvelUsager}
//             attente={attente}
//             setAttente={setAttente}
//             setAuthentifier={setAuthentifier}
//             setCompteRecovery={setCompteRecovery}
//             dureeSession={dureeSession}
//             setDureeSession={setDureeSession}
//             erreurCb={erreurCb}
//             />
//     )
// }

function FormSelectionnerUsager(props) {

    const {
        nomUsager, setNomUsager,
        nouvelUsager, setNouvelUsager,
        attente, setAttente,
        setAuthentifier,
        setCompteRecovery,
        dureeSession, setDureeSession,
        erreurCb,
    } = props

    const [listeUsagers, setListeUsagers] = useState('')
    
    const usagerWebAuth = useUsagerWebAuth()[0]

    useEffect(()=>{
        usagerDao.getListeUsagers()
            .then(usagers=>{
                if(usagers.length === 0) setNouvelUsager(true)
                usagers.sort()  // Trier liste par nom
                console.debug("Liste usagers locaux (IDB) ", usagers)
                setListeUsagers(usagers)
            })
            .catch(err=>erreurCb(err))
    }, [setListeUsagers, setNouvelUsager, erreurCb])

    const peutActiver = useMemo(()=>{
        if(!usagerWebAuth || !usagerWebAuth.infoUsager) return false
        const methodesDisponibles = usagerWebAuth.infoUsager.methodesDisponibles || {}
        console.debug("FormSelectionnerUsager peutActiver methodesDisponibles : ", methodesDisponibles)
        return methodesDisponibles.activation || false
    }, [usagerWebAuth])

    const setCompteRecoveryCb = useCallback(value=>{
        // Conserver le nomUsager meme en cas d'echec pour reessayer
        window.localStorage.setItem('usager', nomUsager)
        setCompteRecovery(value)
    }, [setCompteRecovery, nomUsager])

    if(nouvelUsager) {
        return (
            <Form.Group controlId="formNomUsager">
                <InputSaisirNomUsager 
                    setNomUsager={setNomUsager}
                    setNouvelUsager={setNouvelUsager} 
                    attente={attente}
                    setAttente={setAttente}
                    setAuthentifier={setAuthentifier}
                    setCompteRecovery={setCompteRecovery}
                    peutActiver={peutActiver}
                    dureeSession={dureeSession}
                    setDureeSession={setDureeSession}
                    erreurCb={erreurCb}
                    />
            </Form.Group>
        )
    }

    return (
        <Form.Group controlId="formNomUsager">
            <InputAfficherListeUsagers 
                nomUsager={nomUsager}
                setNomUsager={setNomUsager}
                setNouvelUsager={setNouvelUsager} 
                attente={attente}
                setAttente={setAttente}
                setAuthentifier={setAuthentifier}
                listeUsagers={listeUsagers}
                setCompteRecovery={setCompteRecoveryCb}
                peutActiver={peutActiver}
                dureeSession={dureeSession}
                setDureeSession={setDureeSession}
                erreurCb={erreurCb}
                />
        </Form.Group>
    )
}

function InputSaisirNomUsager(props) {
    const {
        setNomUsager, 
        attente, setAttente, 
        setNouvelUsager, 
        setAuthentifier, 
        dureeSession, setDureeSession,
        erreurCb
    } = props

    const {t} = useTranslation()
    const workers = useWorkers()

    const [nom, setNom] = useState('')
   
    const nomUsagerOnChangeCb = useCallback(event=>setNom(event.currentTarget.value), [setNom])
    const onChangeDureeSession = useCallback(event=>setDureeSession(event.currentTarget.value), [setDureeSession])
    const annulerHandler = useCallback(()=>setNouvelUsager(false), [setNouvelUsager])

    const suivantCb = useCallback(
        () => {
            console.debug("BoutonsAuthentifier Suivantcb %s", nom)
            setNomUsager(nom)       // useEffect sur SectionAuthentification va reloader webauth et idb
            setAuthentifier(true)   // Lance l'ecran d'inscription ou login
        }, 
        [workers, nom, setNomUsager, setAttente, setAuthentifier, erreurCb]
    )

    useEffect(()=>{
        workers.connexion.clearFormatteurMessage()
            .catch(err=>console.error("InputSaisirNomUsager Erreur clearFormatteurMessages"))
    }, [workers])
    
    if(!!props.show) return ''

    let loginSansVerification = false  //  TODO FIX ME : peutActiver
    let variantBouton = loginSansVerification?'success':'primary'
    const suivantDisabled = nom?false:true

    return (
        <div>
            <Form.Group controlId="formNomUsager">
                <Form.Label><Trans>Authentification.nomUsager</Trans></Form.Label>
                <Form.Control
                    type="text"
                    placeholder={t('Authentification.saisirNom')}
                    value={nom}
                    onChange={nomUsagerOnChangeCb}
                    disabled={attente} />
        
                <Form.Text className="text-muted">
                    <Trans>Authentification.instructions1</Trans>
                </Form.Text>
            </Form.Group>

            <p></p>
            <SelectDureeSession value={dureeSession} onChange={onChangeDureeSession} />            

            <Row className="boutons preauth">
                <Col xs={12} sm={4} className="bouton-gauche">
                    <Button variant={variantBouton} disabled={attente || suivantDisabled} onClick={suivantCb}>
                        <Trans>Forms.next</Trans>
                    </Button>
                </Col>
                <Col xs={12} sm={4} >
                    <Button variant="secondary" disabled={true}>
                        <Trans>Forms.new</Trans>
                    </Button>
                </Col>
                <Col xs={12} sm={4}  className="bouton-droite">
                    <Button variant="secondary" onClick={annulerHandler}>
                        <Trans>Forms.cancel</Trans>
                    </Button>
                </Col>
            </Row>
        </div>
    )
}

function InputAfficherListeUsagers(props) {

    const {
        nomUsager, setNomUsager,
        listeUsagers, 
        setNouvelUsager, 
        attente, setAttente,
        setAuthentifier, 
        peutActiver,
        dureeSession, setDureeSession,
        setCompteRecovery,
        erreurCb,
    } = props

    const {t} = useTranslation()
    const workers = useWorkers()

    const nouvelUsagerHandler = useCallback( () => {
        setNouvelUsager(true)
    }, [setNomUsager, setNouvelUsager])

    const usagerOnChange = useCallback(event=>{
        setNouvelUsager(false)
        setNomUsager(event.currentTarget.value)
    }, [setNomUsager, setNouvelUsager])

    const onChangeDureeSession = useCallback(event=>setDureeSession(event.currentTarget.value), [setDureeSession])

    const onSuccessWebAuth = useCallback(resultat=>{
        console.debug("InputAfficherListeUsagers onSuccessWebAuth ", resultat)

        const params = {...resultat, nomUsager}
        sauvegarderUsagerMaj(workers, params)
            .then(async () => {
                if(!!resultat.auth) {
                    console.info("InputAfficherListeUsagers Auth OK pour :", nomUsager)
                    window.localStorage.setItem('usager', nomUsager)
                    // Activer session via module /webauth (cookies, etc.) en se reconnectant
                    await workers.connexion.deconnecter()
                    await workers.connexion.connecter()
                } else {
                    console.error("onSuccessWebAuth Echec Authentification ", resultat)
                }
            })
            .catch(erreurCb)
            .finally(()=>setAttente(false))
    }, [workers, nomUsager, setAuthentifier, setAttente])

    const erreurAuthCb = useCallback((err, message)=>{
        if(err && ![0, 11, 20].includes(err.code)) {
            erreurCb(err, message)
        } else {
            //console.debug("Erreur authentification annulee/mauvaise cle, on passe au mode recovery")
            setCompteRecovery(true)
            setAuthentifier(true)
        }
    }, [erreurCb, setCompteRecovery, setAuthentifier])

    const suivantNoAuthCb = useCallback(
        () => {
            console.debug("BoutonsAuthentifier Suivantcb %s", nomUsager)
            try {
                setAttente(true)
                setAuthentifier(true)
                // workers.connexion.onConnect()
                //     .catch(erreurCb)
            } catch(err) {
                erreurCb(err)
            } finally {
                setAttente(false)
            }
        }, 
        [workers, nomUsager, setAttente, setAuthentifier, erreurCb]
    )

    useEffect(()=>{
        // console.debug("Re-Set nom usager")
        if(listeUsagers.length > 0) {
            if(!listeUsagers.includes(nomUsager)) {
                // Default au premier usager dans la liste
                setNomUsager(listeUsagers[0])
            }
        }
    }, [nomUsager, setNomUsager, listeUsagers])

    if(!listeUsagers) return ''

    return (
        <div>
            <Form.Group controlId="formNomUsager">
                <Form.Label><Trans>Authentification.nomUsager</Trans></Form.Label>
                <Form.Select
                    type="text"
                    value={nomUsager}
                    placeholder={t('Authentification.saisirNom')}
                    onChange={usagerOnChange}
                    disabled={attente}>
            
                    {props.listeUsagers.map(nomUsager=>(
                        <option key={nomUsager} value={nomUsager}>{nomUsager}</option>
                    ))}
        
                </Form.Select>
        
                <Form.Text className="text-muted">
                    <Trans>Authentification.instructions2</Trans>
                </Form.Text>
            </Form.Group>

            <p></p>

            <SelectDureeSession value={dureeSession} onChange={onChangeDureeSession} />

            <Row className="boutons preauth">

                <Col xs={12} sm={4} className="bouton-gauche">
                    <BoutonAuthentifierListe
                        setAttente={setAttente}
                        onClickWebAuth={onSuccessWebAuth}
                        suivantNoWebauthnHandler={suivantNoAuthCb}
                        erreurAuthCb={erreurAuthCb}
                        peutActiver={peutActiver}
                        dureeSession={dureeSession}
                    >
                        <Trans>Forms.next</Trans>
                        {peutActiver?[' ', <i className='fa fa-arrow-right'/>]:''}
                    </BoutonAuthentifierListe>
                </Col>

                <Col xs={12} sm={4} >
                    <Button variant="secondary" onClick={nouvelUsagerHandler}>
                        <Trans>Forms.new</Trans>
                    </Button>
                </Col>

                <Col xs={12} sm={4}  className="bouton-droite">
                    <Button variant="secondary" disabled={true}>
                        <Trans>Forms.cancel</Trans>
                    </Button>
                </Col>

            </Row>            
        </div>
    )

}

function BoutonAuthentifierListe(props) {

    // console.debug('BoutonAuthentifierListe PROPPIES', props)

    const { onClickWebAuth, suivantNoWebauthnHandler, erreurAuthCb, peutActiver, dureeSession } = props

    const usagerWebAuth = useUsagerWebAuth()[0]
    const usagerDb = useUsagerDb()[0]

    const nouvelUsager = useMemo(()=>{
        console.debug("BoutonAuthentifierListe usagerWebAuth : %O", usagerWebAuth)
        if(usagerWebAuth && !usagerWebAuth.infoUsager) return true
        return false
    }, [usagerWebAuth])

    const challengeWebauthn = useMemo(()=>{
        if(usagerWebAuth && usagerWebAuth.infoUsager) {
            return usagerWebAuth.infoUsager.authentication_challenge
        }
        return ''
    }, [usagerWebAuth])

    if(nouvelUsager || peutActiver === true) {
        return (
            <Button variant="success" onClick={suivantNoWebauthnHandler}>{props.children}</Button>
        )
    }

    return (
        <BoutonAuthentifierWebauthn
            variant="primary"
            challenge={challengeWebauthn}
            onSuccess={onClickWebAuth}
            onError={erreurAuthCb}
            usagerDb={usagerDb}
            dureeSession={dureeSession}
        >
            {props.children}
        </BoutonAuthentifierWebauthn>        
    )
}

// async function chargerFormatteurCertificat(workers, usagerDb) {
//     console.debug("Preparer formatteur de messages pour usager %O", usagerDb)
//     const connexion = workers.connexion
//     const { certificat, clePriveePem } = usagerDb
//     if(connexion && certificat && clePriveePem) {
//         await connexion.initialiserFormatteurMessage(certificat, clePriveePem)
//         return true
//     } else {
//         await connexion.clearFormatteurMessage()
//         return false
//     }
// }

