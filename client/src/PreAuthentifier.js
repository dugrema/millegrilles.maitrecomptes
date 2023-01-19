import {useEffect, useState, useCallback, useMemo} from 'react'
import {proxy as comlinkProxy} from 'comlink'

import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import { Trans, useTranslation } from 'react-i18next'

import { BoutonActif, usagerDao } from '@dugrema/millegrilles.reactjs'

import useWorkers, {useEtatConnexion, useInfoConnexion, useUsager, useEtatPret} from './WorkerContext'

import { BoutonAuthentifierWebauthn } from './WebAuthn'
import { RenderCsr } from './QrCodes'

import { sauvegarderCertificatPem, initialiserCompteUsager } from './comptesUtil'

function PreAuthentifier(props) {
    
    const { 
        erreurCb, 
        setResultatAuthentificationUsager,
    } = props

    const workers = useWorkers()
    const etatConnexion = useEtatConnexion()
    // const etatUsagerBackend = useInfoConnexion()

    const [listeUsagers, setListeUsagers] = useState('')
    const [nomUsager, setNomUsager] = useState(window.localStorage.getItem('usager')||'')

    // Flags
    const [nouvelUsager, setNouvelUsager] = useState(false)  // Flag pour bouton nouvel usager
    const [authentifier, setAuthentifier] = useState(false)  // Flag pour ecran inscrire/authentifier
    const [attente, setAttente] = useState(false)
    const [compteRecovery, setCompteRecovery] = useState(false)  // Mode pour utiliser un code pour associer compte

    // Information usager temporaire pour auth
    const [usagerDbLocal, setUsagerDbLocal] = useState('')          // Info db locale pre-auth pour nomUsager
    const [etatUsagerBackend, setEtatUsagerBackend] = useState('')  // Info serveur pre-auth pour nomUsager

    useEffect(()=>{
        usagerDao.getListeUsagers()
            .then(usagers=>{
                if(usagers.length === 0) setNouvelUsager(true)
                usagers.sort()  // Trier liste par nom
                setListeUsagers(usagers)
            })
            .catch(err=>erreurCb(err))
    }, [setListeUsagers, setNouvelUsager, erreurCb])

    // Charger l'usager chaque fois le nomUsager change
    

    // Detecter le chargement d'un certificat via fingerprintPk
    // Le certificat peut arriver via requete ou evenement
    useEffect(()=>{
        if(!usagerDbLocal) return

        const { connexion } = workers
        const nomUsager = usagerDbLocal.nomUsager
        const requete = usagerDbLocal.requete

        if(requete && etatUsagerBackend.infoUsager && etatUsagerBackend.infoUsager.certificat) {
            const infoUsager = etatUsagerBackend.infoUsager || {},
                  certificat = infoUsager.certificat

            if(certificat) {
                // console.debug("Nouveau certificat recu (via fingerprintPk) : %O\nRequete %O", certificat, requete)
                const { clePriveePem, fingerprintPk } = requete
                sauvegarderCertificatPem(nomUsager, certificat, {requete: null, fingerprintPk, clePriveePem})
                    .then(async () => {
                        const usagerMaj = await usagerDao.getUsager(nomUsager)
                        // Charger info back-end, devrait avoir l'autorisation d'activation
                        const nouvelleInfoBackend = await chargerUsager(connexion, nomUsager, null, fingerprintPk)

                        console.debug("Nouvelle information, local %O, back-end %O", usagerMaj, nouvelleInfoBackend)

                        // Revenir a l'ecran d'authentification
                        setAuthentifier(false)
                        setCompteRecovery(false)

                        // Pour eviter cycle, on fait sortir de l'ecran en premier. Set Usager ensuite.
                        setEtatUsagerBackend(nouvelleInfoBackend)
                        setUsagerDbLocal(usagerMaj)

                        // console.debug("Certificat sauvegarde, usager pret ", usagerMaj)
                    })
                    .catch(err=>{
                        erreurCb(err)
                    })
            }
        }
    }, [workers, usagerDbLocal, etatUsagerBackend, erreurCb, setUsagerDbLocal])

    let Etape = FormSelectionnerUsager
    if(compteRecovery) Etape = CompteRecovery
    else if(authentifier && etatUsagerBackend && etatUsagerBackend.infoUsager) {
        if(etatUsagerBackend.infoUsager.compteUsager === false) Etape = InscrireUsager
        else Etape = Authentifier
    }

    return (
        <Row>
            <Col xs={0} sm={1} md={2} lg={3}></Col>
            <Col xs={12} sm={10} md={8} lg={6}>
                <p></p>
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
                    setResultatAuthentificationUsager={setResultatAuthentificationUsager}
                    // usagerSessionActive={usagerSessionActive}
                    // setUsagerSessionActive={setUsagerSessionActive}
                    // compteRecovery={compteRecovery}
                    setCompteRecovery={setCompteRecovery}
                    erreurCb={erreurCb}
                />
            </Col>
        </Row>
    )
}

export default PreAuthentifier

function FormSelectionnerUsager(props) {

    const {
        nomUsager, setNomUsager,
        nouvelUsager, setNouvelUsager,
        attente, setAttente,
        setAuthentifier,
        listeUsagers,
        setCompteRecovery,
        setResultatAuthentificationUsager,
        etatUsagerBackend, setEtatUsagerBackend, 
        usagerDbLocal, setUsagerDbLocal,
        erreurCb,
    } = props

    const etatUsagerInfo = etatUsagerBackend.infoUsager || {},
        activation = etatUsagerInfo.activation || {},
        peutActiver = activation.associe === false

    if(nouvelUsager) {
        return (
            <Form.Group controlId="formNomUsager">
                <InputSaisirNomUsager 
                    nomUsager={nomUsager}
                    setNomUsager={setNomUsager}
                    setNouvelUsager={setNouvelUsager} 
                    attente={attente}
                    setAttente={setAttente}
                    setAuthentifier={setAuthentifier}
                    setCompteRecovery={setCompteRecovery}
                    peutActiver={peutActiver}
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
                setCompteRecovery={setCompteRecovery}
                setResultatAuthentificationUsager={setResultatAuthentificationUsager}
                usagerDbLocal={usagerDbLocal} 
                setUsagerDbLocal={setUsagerDbLocal}
                etatUsagerBackend={etatUsagerBackend} 
                setEtatUsagerBackend={setEtatUsagerBackend}
                peutActiver={peutActiver}
                erreurCb={erreurCb}
                />
        </Form.Group>
    )
}

function InputSaisirNomUsager(props) {
    const {
        setNomUsager: setNom, 
        attente, setAttente, 
        setNouvelUsager, 
        setAuthentifier, 
        etatUsagerBackend, setEtatUsagerBackend,
        setCompteRecovery,
        setUsagerDbLocal,
        peutActiver,
        erreurCb
    } = props

    const {t} = useTranslation()
    const workers = useWorkers()

    const [nomUsager, setNomUsager] = useState('')
   
    const changerNomUsager = useCallback(event=>setNomUsager(event.currentTarget.value), [setNomUsager])

    const annulerHandler = useCallback(()=>setNouvelUsager(false), [setNouvelUsager])

    const suivantCb = useCallback(
        () => {
            console.debug("BoutonsAuthentifier Suivantcb")
            setAttente(true)
            preparerUsager(workers, nomUsager, erreurCb)
                .then(async resultat => {
                    const usagerDbLocal = await usagerDao.getUsager(nomUsager)
                    setNom(nomUsager)
                    setEtatUsagerBackend(resultat)
                    setUsagerDbLocal(usagerDbLocal)
                    setAuthentifier(true)
                })
                .catch(err=>erreurCb(err))
                .finally(()=>setAttente(false))
        }, 
        [workers, nomUsager, setNom, setEtatUsagerBackend, setAuthentifier, setAttente, erreurCb]
    )

    if(!!props.show) return ''

    let loginSansVerification = peutActiver
    let variantBouton = loginSansVerification?'success':'primary'
    const suivantDisabled = nomUsager?false:true

    return (
        <Form.Group controlId="formNomUsager">
            <Form.Label><Trans>Authentification.nomUsager</Trans></Form.Label>
            <Form.Control
                type="text"
                placeholder={t('Authentification.saisirNom')}
                value={nomUsager}
                onChange={changerNomUsager}
                disabled={attente} />
    
            <Form.Text className="text-muted">
                <Trans>Authentification.instructions1</Trans>
            </Form.Text>
            
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
        </Form.Group>
    )
}

function InputAfficherListeUsagers(props) {

    const {
        // workers, etatConnexion, disabled, 
        nomUsager, setNomUsager,
        listeUsagers, 
        setNouvelUsager, 
        attente, setAttente,
        setAuthentifier, 
        usagerDbLocal, setUsagerDbLocal,
        etatUsagerBackend, setEtatUsagerBackend,
        setCompteRecovery,
        setResultatAuthentificationUsager,
        peutActiver,
        erreurCb,
    } = props

    const {t} = useTranslation()
    const workers = useWorkers()
    const etatConnexion = useEtatConnexion()
    const { connexion } = workers

    const nouvelUsagerHandler = useCallback( () => {
        Promise.all([
            setNomUsager(''),
            setEtatUsagerBackend(''),
            setUsagerDbLocal(''),
            setResultatAuthentificationUsager(''),
        ]).then(()=>setNouvelUsager(true))
    }, [setNomUsager, setNouvelUsager, setEtatUsagerBackend, setResultatAuthentificationUsager])

    const onChangeUsager = useCallback(event=>{
        setEtatUsagerBackend('')
        setUsagerDbLocal('')
        setResultatAuthentificationUsager('')
        setNouvelUsager(false)
        setNomUsager(event.currentTarget.value)
    }, [setNomUsager, setEtatUsagerBackend, setUsagerDbLocal, setResultatAuthentificationUsager, setNouvelUsager])

    const onClickWebAuth = useCallback(resultat=>{
        console.debug("InputAfficherListeUsagers onClickWebAuth")
        setAuthentifier(true)
        setResultatAuthentificationUsager(resultat)
        connexion.onConnect()
            .catch(err=>console.error("InputAfficherListeUsagers Erreur onClickWebAuth ", err))
    }, [setAuthentifier, setResultatAuthentificationUsager])

    const erreurAuthCb = useCallback((err, message)=>{
        if(err && ![0, 11, 20].includes(err.code)) {
            erreurCb(err, message)
        } else {
            //console.debug("Erreur authentification annulee/mauvaise cle, on passe au mode recovery")
            setCompteRecovery(true)
            setAuthentifier(true)
        }
    }, [erreurCb, setCompteRecovery, setAuthentifier])

    useEffect(()=>{
        if(listeUsagers.length > 0) {
            if(listeUsagers.includes(nomUsager)) {
                // Rien a faire
            } else {
                const usagerLocal = window.localStorage.getItem('usager')
                if(listeUsagers.includes(usagerLocal)) {
                    console.debug("Set nom usager 1 - ", usagerLocal)
                    setNomUsager(usagerLocal)
                } else {
                    console.debug("Set nom usager 2 - ", listeUsagers[0])
                    setNomUsager(listeUsagers[0])
                }
            }
        }
    }, [nomUsager, setNomUsager, listeUsagers])

    useEffect(()=>{
        console.debug("Pre-charger usager (etat %O) %O", etatConnexion, nomUsager)
        if(etatConnexion && nomUsager) {
            console.debug("Pre-charger le compte usager %s", nomUsager)
            preparerUsager(workers, nomUsager, erreurCb)
                .then(async resultat => {
                    const usagerDbLocal = await usagerDao.getUsager(nomUsager)
                    setEtatUsagerBackend(resultat)
                    setUsagerDbLocal(usagerDbLocal)
                    console.debug("Usager backend info %O, dbLocal %O", resultat, usagerDbLocal)
                    // setAuthentifier(true)
                })
                .catch(err=>erreurCb(err))
                .finally(()=>setAttente(false))
        }
    }, [connexion, etatConnexion, workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, erreurCb])

    if(!listeUsagers) return ''
  
    return (
        <Form.Group controlId="formNomUsager">
            <Form.Label><Trans>Authentification.nomUsager</Trans></Form.Label>
            <Form.Select
                type="text"
                value={nomUsager}
                placeholder={t('Authentification.saisirNom')}
                onChange={onChangeUsager}
                disabled={attente}>
        
                {props.listeUsagers.map(nomUsager=>(
                    <option key={nomUsager} value={nomUsager}>{nomUsager}</option>
                ))}
    
            </Form.Select>
    
            <Form.Text className="text-muted">
                <Trans>Authentification.instructions2</Trans>
            </Form.Text>

            <Row className="boutons preauth">

                <Col xs={12} sm={4} className="bouton-gauche">
                    <BoutonAuthentifierListe
                        etatUsagerBackend={etatUsagerBackend}
                        setAttente={setAttente}
                        onClickWebAuth={onClickWebAuth}
                        erreurAuthCb={erreurAuthCb}
                        usagerDbLocal={usagerDbLocal}
                        peutActiver={peutActiver}
                    >
                        <Trans>Forms.next</Trans>
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
        </Form.Group>
    )
}

function CompteRecovery(props) {

    const { 
        workers, etatUsagerBackend,
        // setUsagerDbLocal, 
        setEtatUsagerBackend, 
        setResultatAuthentificationUsager, setAuthentifier, setCompteRecovery,
        erreurCb,
    } = props

    const { t } = useTranslation()

    // const usagerDbLocal = useMemo(()=>{return props.usagerDbLocal || {}}, [props.usagerDbLocal])

    const usagerDbLocal = useUsager()

    const requete = usagerDbLocal.requete || {},
          csr = requete.csr,
          fingerprintPk = requete.fingerprintPk,
          nomUsager = usagerDbLocal.nomUsager

    const [code, setCode] = useState('')

    const onClickWebAuth = useCallback(resultat=>{
        setCompteRecovery(false)  // succes login
        setResultatAuthentificationUsager(resultat)
    }, [setCompteRecovery, setResultatAuthentificationUsager])

    const erreurAuthCb = useCallback((err, message)=>{
        if(err && ![0, 11, 20].includes(err.code)) {
            erreurCb(err, message)
        } else {
            erreurCb("Erreur authentification annulee ou mauvaise cle")
        }
    }, [erreurCb])

    const retourCb = useCallback(()=>{
        setAuthentifier(false)
        setCompteRecovery(false)
    }, [setAuthentifier, setCompteRecovery])

    const evenementFingerprintPkCb = useCallback(evenement=>{
        const { connexion } = workers
        //console.debug("Recu message evenementFingerprintPkCb : %O", evenement)
        const { message } = evenement || {},
              { certificat } = message
        const requete = usagerDbLocal.requete
        if(certificat && requete) {
            const { clePriveePem, fingerprintPk } = requete
            sauvegarderCertificatPem(nomUsager, certificat, {clePriveePem, fingerprintPk})
                .then(async ()=>{
                    const usagerMaj = await usagerDao.getUsager(nomUsager)
                    const nouvelleInfoBackend = await chargerUsager(connexion, nomUsager, null, fingerprintPk)

                    // Revenir a l'ecran d'authentification
                    setAuthentifier(false)
                    setCompteRecovery(false)

                    // Pour eviter cycle, on fait sortir de l'ecran en premier. Set Usager ensuite.
                    setEtatUsagerBackend(nouvelleInfoBackend)
                    throw new Error('tood')
                    // setUsagerDbLocal(usagerMaj)
                })
                .catch(err=>erreurCb(err, "Erreur de sauvegarde du nouveau certificat, veuillez cliquer sur Retour et essayer a nouveau."))
        } else {
            console.warn("Recu message evenementFingerprintPkCb sans certificat %O ou requete locale vide %O", evenement, requete)
            erreurCb("Erreur de sauvegarde du nouveau certificat, veuillez cliquer sur Retour et essayer a nouveau.")
        }
    }, [
        workers, nomUsager, usagerDbLocal, 
        setAuthentifier, setCompteRecovery, setEtatUsagerBackend,
        erreurCb,
    ])

    // Utilise pour authentifier sans webauthn (certificat pre-approuve)
    const suivantNoWebauthnHandler = useCallback(()=>{
        throw new Error('todo')
    }, [])

    useEffect(()=>{
        const { nomUsager, requete } = usagerDbLocal
        if(nomUsager) {
            if(!requete) {
                //console.debug("Generer nouveau CSR")
                initialiserCompteUsager(nomUsager, {regenerer: true})
                    .then(usager=>{
                        throw new Error('todo')
                        // setUsagerDbLocal(usager)
                        return ajouterCsrRecovery(workers, usager)
                    })
                    .catch(err=>erreurCb(err))
            } else {
                ajouterCsrRecovery(workers, usagerDbLocal)
                    .catch(err=>erreurCb(err))
            }
        }
    }, [workers, nomUsager, usagerDbLocal, erreurCb])

    useEffect(()=>{
        if(fingerprintPk) {
            let codeComplet = fingerprintPk.slice(fingerprintPk.length-8)
            codeComplet = codeComplet.toLowerCase()
            codeComplet = [codeComplet.slice(0,4), codeComplet.slice(4,8)].join('-')
            setCode(codeComplet)
        } else {
            setCode('')
        }
    }, [fingerprintPk, setCode])

    useEffect(()=>{
        const { connexion } = workers
        if(fingerprintPk) {
            const cb = comlinkProxy(evenementFingerprintPkCb)
            //console.debug("Ajouter listening fingerprints : %s", fingerprintPk)
            connexion.enregistrerCallbackEvenementsActivationFingerprint(fingerprintPk, cb)
                .catch(err=>erreurCb(err))
            return () => {
                //console.debug("Retrait listening fingerprints : %s", fingerprintPk)
                connexion.retirerCallbackEvenementsActivationFingerprint(fingerprintPk, cb)
                    .catch(err=>console.warn("Erreur retrait evenement fingerprints : %O", err))
            }
        }
    }, [workers, fingerprintPk, evenementFingerprintPkCb, erreurCb])

    return (
        <>
            <Row>
                <Col xs={10} md={11}><h2>{t('Authentification.echec-titre')}</h2></Col>
                <Col xs={2} md={1} className="bouton"><Button onClick={retourCb} variant="secondary"><i className='fa fa-remove'/></Button></Col>
            </Row>

            <p>{t('Authentification.echec-description')}</p>

            <Row>
                <Col>
                    <h3>{t('Authentification.echec-cle-titre')}</h3>
                    
                    <p>{t('Authentification.echec-cle-instruction')}</p>

                    <BoutonAuthentifierWebauthn
                        variant="secondary"
                        workers={workers}
                        challenge={etatUsagerBackend.infoUsager.challengeWebauthn}
                        onClickWebAuth={onClickWebAuth}
                        suivantNoWebauthnHandler={suivantNoWebauthnHandler}
                        erreurCb={erreurAuthCb}
                        usagerDbLocal={usagerDbLocal}
                    >
                        {t('Authentification.echec-cle-bouton')}
                    </BoutonAuthentifierWebauthn>

                    <p></p>

                    <h2>{t('Authentification.echec-activation-titre')}</h2>
                    <p>{t('Authentification.echec-activation-instruction1')}</p>
                    <p>{t('Authentification.echec-activation-instruction2')}</p>
                    <Row><Col xs={4}>{t('Authentification.echec-activation-champ-compte')}</Col><Col>{nomUsager}</Col></Row>
                    <Row><Col xs={4}>{t('Authentification.echec-activation-champ-code')}</Col><Col>{code}</Col></Row>

                </Col>
                <Col>
                    <h3>{t('Authentification.echec-codeqr-titre')}</h3>
                    <p>{t('Authentification.echec-codeqr-instruction')}</p>
                    <RenderCsr value={csr} size={200} />
                </Col>
            </Row>
        </>
    )
}

function BoutonAuthentifierListe(props) {

    console.debug('BoutonAuthentifierListe PROPPIES', props)

    const {
        etatUsagerBackend, onClickWebAuth, suivantNoWebauthnHandler, 
        erreurAuthCb, usagerDbLocal, peutActiver,
    } = props

    const workers = useWorkers()

    const challengeWebauthn = useMemo(()=>{
        if(etatUsagerBackend && etatUsagerBackend.infoUsager) {
            return etatUsagerBackend.infoUsager.challengeWebauthn
        }
        return ''
    }, [etatUsagerBackend])

    if(peutActiver === true) {
        return (
            <Button variant="success" onClick={suivantNoWebauthnHandler}>{props.children}</Button>
        )
    }

    return (
        <BoutonAuthentifierWebauthn
            variant="secondary"
            workers={workers}
            challenge={challengeWebauthn}
            setResultatAuthentificationUsager={onClickWebAuth}
            erreurCb={erreurAuthCb}
            usagerDbLocal={usagerDbLocal}
        >
            {props.children}
        </BoutonAuthentifierWebauthn>        
    )
}

// function BoutonsAuthentifier(props) {

//     const {
//         workers, nomUsager, setNomUsager, nouvelUsager, setNouvelUsager, etatUsagerBackend, setEtatUsagerBackend, 
//         // usagerDbLocal, setUsagerDbLocal, 
//         usagerSessionActive, setAuthentifier, attente, setAttente, erreurCb, 
//         setResultatAuthentificationUsager, setCompteRecovery,
//     } = props

//     const usagerDbLocal = useUsager()

//     const suivantDisabled = nomUsager?false:true

//     const setNouvelUsagerCb = useCallback( () => {
//         throw new Error('todo')
//         Promise.all([
//             setNomUsager(''),
//             // setEtatUsagerBackend(''),
//             // setUsagerDbLocal(''),
//             setResultatAuthentificationUsager(''),
//         ]).then(()=>setNouvelUsager(true))
//     }, [setNomUsager, setNouvelUsager, setEtatUsagerBackend, setResultatAuthentificationUsager])
//     const annulerCb = useCallback( () => setNouvelUsager(false), [setNouvelUsager])
//     const suivantCb = useCallback(
//         () => {
//             // console.debug("BoutonsAuthentifier Suivantcb")
//             if(nouvelUsager === true) {
//                 setAttente(true)
//                 throw new Error('todo')
//                 // preparerUsager(workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, erreurCb)
//                 //     .then(()=>setAuthentifier(true))
//                 //     .catch(err=>erreurCb(err))
//                 //     .finally(()=>setAttente(false))
//             } else {
//                 // Information deja chargee, on authentifie
//                 setAuthentifier(true)
//             }
//         }, 
//         [workers, nouvelUsager, nomUsager, setEtatUsagerBackend, setAuthentifier, setAttente, erreurCb]
//     )
//     const onClickWebAuth = useCallback(resultat=>{
//         // console.debug("BoutonsAuthentifier onClickWebAuth")
//         setAuthentifier(true)
//         setResultatAuthentificationUsager(resultat)
//     }, [setAuthentifier, setResultatAuthentificationUsager])

//     const erreurAuthCb = useCallback((err, message)=>{
//         if(err && ![0, 11, 20].includes(err.code)) {
//             erreurCb(err, message)
//         } else {
//             //console.debug("Erreur authentification annulee/mauvaise cle, on passe au mode recovery")
//             setCompteRecovery(true)
//             setAuthentifier(true)
//         }
//     }, [erreurCb, setCompteRecovery, setAuthentifier])

//     useEffect(()=>{
//         if(usagerSessionActive) {
//             // console.debug("Session active pour usager %s, on simule click sur Suivant")
//             suivantCb()
//         }
//     }, [suivantCb, usagerSessionActive])

//         // Verifier si on a au moins 1 credential enregistre avec webauthn
//     const etatUsagerInfo = etatUsagerBackend.infoUsager || {},
//           activation = etatUsagerInfo.activation || {},
//           peutActiver = activation.associe === false,
//           challengeWebauthn = etatUsagerInfo.challengeWebauthn || {},
//           allowCredentials = challengeWebauthn.allowCredentials || {}

//     let loginSansVerification = etatUsagerBackend && peutActiver

//     let variantBouton = loginSansVerification?'success':'primary'

//     let boutonSuivant = (
//         <Button variant={variantBouton} disabled={attente || suivantDisabled} onClick={suivantCb}>
//             <Trans>Forms.next</Trans>
//         </Button>
//     )

//     if(allowCredentials.length > 0 && !peutActiver) {
//         boutonSuivant = (
//             <BoutonAuthentifierWebauthn
//                 workers={workers}
//                 challenge={etatUsagerBackend.infoUsager.challengeWebauthn}
//                 setAttente={setAttente}
//                 setResultatAuthentificationUsager={onClickWebAuth}
//                 erreurCb={erreurAuthCb}
//                 usagerDbLocal={usagerDbLocal}
//             >
//                 <Trans>Forms.next</Trans>
//             </BoutonAuthentifierWebauthn>
//         )
//     }

//     return (
//         <>
//             <Row className="boutons preauth">
//                 <Col xs={12} sm={4} className="bouton-gauche">
//                     <BoutonAuthentifierWebauthn
//                         workers={workers}
//                         challenge={etatUsagerBackend.infoUsager.challengeWebauthn}
//                         setAttente={setAttente}
//                         setResultatAuthentificationUsager={onClickWebAuth}
//                         erreurCb={erreurAuthCb}
//                         usagerDbLocal={usagerDbLocal}
//                     >
//                         <Trans>Forms.next</Trans>
//                     </BoutonAuthentifierWebauthn>
//                 </Col>
//                 <Col xs={12} sm={4} >
//                     <Button variant="secondary" disabled={nouvelUsager} onClick={setNouvelUsagerCb}>
//                         <Trans>Forms.new</Trans>
//                     </Button>
//                 </Col>
//                 <Col xs={12} sm={4}  className="bouton-droite">
//                     <Button variant="secondary" disabled={!nouvelUsager} onClick={annulerCb}>
//                         <Trans>Forms.cancel</Trans>
//                     </Button>
//                 </Col>
//             </Row>

//             <br/>

//             <Alert variant="dark" show={loginSansVerification?true:false}>
//                 <Alert.Heading><Trans>Authentification.compte-debloque-titre</Trans></Alert.Heading>
//                 <p>
//                     <Trans>Authentification.compte-debloque-description</Trans>
//                 </p>
//             </Alert>

//         </>
//     )
// }

function InscrireUsager(props) {

    const { t } = useTranslation()

    const {workers, setAuthentifier, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb} = props

    const [etatBouton, setEtatBouton] = useState('')

    const onClickSuivant = useCallback( () => {
        setEtatBouton('attente')
        suivantInscrire(workers, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb)
            .then(()=>{
                setEtatBouton('succes')
            })
            .catch(err=>{
                setEtatBouton('echec')
                erreurCb(err)
            })
    }, [workers, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, setEtatBouton, erreurCb])
    const onClickAnnuler = useCallback( () => setAuthentifier(false), [setAuthentifier])

    return (
        <>
            <h2><Trans>Authentification.creer-compte-titre</Trans></h2>

            <div>
                <p>{t('Authentification.creer-compte-disponible', {nomUsager: props.nomUsager})}</p>

                <p><Trans>Authentification.creer-compte-instructions</Trans></p>

                <Row className="boutons">
                    <Col className="bouton-gauche">
                        <BoutonActif etat={etatBouton} onClick={onClickSuivant}>
                            <Trans>Authentification.bouton-inscrire</Trans>
                        </BoutonActif>
                    </Col>
                    <Col className="bouton-droite">
                        <Button variant="secondary" onClick={onClickAnnuler}>
                            <Trans>Forms.cancel</Trans>
                        </Button>
                    </Col>
                </Row>
            </div>
        </>
    )
}

function Authentifier(props) {

    const {
        nouvelUsager, setAttente, 
        nomUsager, 
        // usagerDbLocal, 
        setAuthentifier, etatUsagerBackend, setEtatUsagerBackend, 
        setResultatAuthentificationUsager, setUsagerSessionActive, 
        setCompteRecovery,
        erreurCb
    } = props

    const workers = useWorkers(),
          etatPret = useEtatPret(),
          usagerDbLocal = useUsager()

    const onClickWebAuth = useCallback(resultat=>{
        // console.debug("Authentifier onclick webauthn : %O", resultat)
        const authentification = {
            ...resultat, 
            authentifie: true, 
            nomUsager,
        }
        setResultatAuthentificationUsager(authentification)
    }, [nomUsager, setResultatAuthentificationUsager])

    // Attendre que le formatteur (certificat) soit pret
    useEffect(()=>{
        //console.debug("Formatteur pret? %s, etat usager back-end : %O", etatPret, etatUsagerBackend)
        if(!usagerDbLocal) return 

        const { connexion } = workers
        if(etatPret===true && etatUsagerBackend) {
            // Authentifier
            const { methodesDisponibles } = etatUsagerBackend.infoUsager
            if(methodesDisponibles.includes('certificat')) {
                // console.debug("Authentifier avec le certificat")
                // connexion.authentifierCertificat(challengeCertificat)
                connexion.authentifier()
                    .then(reponse=>{
                        //console.debug("Reponse authentifier certificat : %O", reponse)
                        setResultatAuthentificationUsager(reponse)
                    })
                    .catch(err=>{
                        console.error("Authentifier: Erreur de connexion : %O", err)
                        erreurCb(err, 'Erreur de connexion (authentification du certificat refusee)')
                    })
            }
        } else if(!nouvelUsager && etatPret === false && !usagerDbLocal.certificat) {
            // On a un certificat absent ou expire
            // console.info("Certificat absent")
            setCompteRecovery(true)
        }
    }, [
        workers, etatPret, nouvelUsager, usagerDbLocal, etatUsagerBackend, 
        setResultatAuthentificationUsager, setCompteRecovery, 
        erreurCb
    ])

    // Conserver usager selectionne (pour reload ecran)
    useEffect(()=>window.localStorage.setItem('usager', nomUsager), [nomUsager])

    const recoveryCb = useCallback(()=>setCompteRecovery(true), [setCompteRecovery])

    const annulerCb = useCallback(()=>{
        fermerSession(setAuthentifier, setEtatUsagerBackend, setUsagerSessionActive)
            .catch(err=>erreurCb(err))
    }, [setAuthentifier, setEtatUsagerBackend, setUsagerSessionActive, erreurCb])

    let message = <p>Ouverture d'une nouvelle session en cours ... <i className="fa fa-spinner fa-spin fa-fw" /></p>
    if(nouvelUsager) message = 'Cliquez sur Suivant pour vous connecter.'
    else if(!etatPret) message = 'Attente de preparation du certificat'

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
                            setResultatAuthentificationUsager={onClickWebAuth}
                            erreurCb={erreurCb}
                            usagerDbLocal={usagerDbLocal}>
                            Suivant
                        </BoutonAuthentifierWebauthn>
                    :''}
                    <Button variant="secondary" onClick={recoveryCb}>Utiliser un code</Button>
                    <Button variant="secondary" onClick={annulerCb}>Annuler</Button>
                </Col>
            </Row>
        </>
    )
}

async function ajouterCsrRecovery(workers, usagerDbLocal) {
    const { connexion } = workers
    const { nomUsager, requete } = usagerDbLocal
    if(nomUsager && requete && requete.csr) {
        const csr = requete.csr
        //console.debug("ajouterCsrRecovery csr: %O", csr)
        await connexion.ajouterCsrRecovery(nomUsager, csr)
        //console.debug("ajouterCsrRecovery Reponse %O", reponse)
    }
}

async function suivantInscrire(workers, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb) {
    //console.debug("Inscrire")
    try {
        const {connexion} = workers
        const usagerInit = await initialiserCompteUsager(nomUsager)
        const requete = usagerInit.requete || {}
        const { csr, clePriveePem, fingerprintPk } = requete
 
        // console.debug("suivantInscrire Inscrire usager %s avec CSR navigateur\n%O", nomUsager, csr)
        const reponseInscription = await connexion.inscrireUsager(nomUsager, csr)
        // console.debug("suivantInscrire Reponse inscription : %O", reponseInscription)
      
        // Enregistrer le certificat dans IndexedDB
        const certificatChaine = reponseInscription.certificat

        if(!certificatChaine) {
            erreurCb("Le certificat n'a pas ete recu lors de la confirmation d'inscription.", "L'inscription a echouee")
            return
        }

        // Injecter delegations_version: 1 au besoin
        reponseInscription.delegations_version = reponseInscription.delegations_version || 1

        // console.debug("suivantInscrire Certificats recus : cert: %O", certificatChaine)
        await sauvegarderCertificatPem(nomUsager, certificatChaine, {clePriveePem, fingerprintPk})
      
        // Recharger usager, applique le nouveau certificat
        const usagerDbLocal = await usagerDao.getUsager(nomUsager)
        await setUsagerDbLocal(usagerDbLocal)

        // Conserver usager selectionne pour reload
        window.localStorage.setItem('usager', nomUsager)

        // Conserver information session
        await setResultatAuthentificationUsager({
            ...reponseInscription, 
            nomUsager,
        })

        // if(reponseInscription.authentifie === true) {
        //     // Declencher une authentification avec le nouveau certificat 
        //     console.debug("suivantInscrire Authentifier")
        //     //await connexion.authentifier()
        // }

    } catch(err) {
        console.error("suivantInscrire Erreur inscrire usager : %O", err)
        erreurCb(err, "Erreur inscrire usager")
    }
}

async function preparerUsager(workers, nomUsager, erreurCb) {
    const connexion = workers.connexion
    // console.debug("Suivant avec usager %s", nomUsager)
    
    // Verifier etat du compte local. Creer ou regenerer certificat (si absent ou expire).
    let usagerLocal = await initialiserCompteUsager(nomUsager) 

    let fingerprintNouveau = null,
        fingerprintCourant = null
    if(usagerLocal) {
        fingerprintCourant = usagerLocal.fingerprintPk
        if(usagerLocal.requete) {
            fingerprintNouveau = usagerLocal.requete.fingerprintPk
        }
    }

    const etatUsagerBackend = await chargerUsager(connexion, nomUsager, fingerprintNouveau, fingerprintCourant)
    console.debug("Etat usager backend : %O", etatUsagerBackend)
    return etatUsagerBackend
    // await setEtatUsagerBackend(etatUsagerBackend)
    // await setUsagerDbLocal(await usagerDao.getUsager(nomUsager))
}

export async function chargerUsager(connexion, nomUsager, fingerprintPk, fingerprintCourant) {
    const infoUsager = await connexion.getInfoUsager(nomUsager, fingerprintPk, fingerprintCourant)
    return {infoUsager, authentifie: false}
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
