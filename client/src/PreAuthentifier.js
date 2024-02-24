import {useEffect, useState, useCallback, useMemo, lazy} from 'react'

import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'

import { Trans, useTranslation } from 'react-i18next'

import { usagerDao, SelectDureeSession } from '@dugrema/millegrilles.reactjs'

import useWorkers, { useUsagerDb, useUsagerWebAuth } from './WorkerContext'
import { BoutonAuthentifierWebauthn } from './WebAuthn'

import { preparerUsagerLocalDb, chargerUsager, verifierDateRenouvellementCertificat } from './comptesUtil'

import Authentifier, { successWebAuth } from './Authentifier'

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
    const [listeUsagers, setListeUsagers] = useState('')

    const [nomUsager, setNomUsager] = useState('')
    const [dureeSession, setDureeSession] = useState(window.localStorage.getItem('dureeSession')||'86400')

    // Flags
    const [authentifierFlag, setAuthentifierFlag] = useState(false)
    const [attenteFlag, setAttenteFlag] = useState(false)
    const [compteRecoveryFlag, setCompteRecoveryFlag] = useState(false)
    const nouvelUsagerToggle = useCallback(()=>setModeAuthentification(MODE_AUTHENTIFICATION_NOUVEL_USAGER), [setModeAuthentification])
    const authentifierToggle = useCallback(()=>setAuthentifierFlag(true), [setAuthentifierFlag])
    const compteRecoveryToggle = useCallback(()=>setCompteRecoveryFlag(true), [setCompteRecoveryFlag])
    
    const annulerHandler = useCallback(mode=>{
        setAuthentifierFlag(false)
        setAttenteFlag(false)
        setCompteRecoveryFlag(false)
        if([MODE_AUTHENTIFICATION_NOUVEL_USAGER, MODE_AUTHENTIFICATION_SELECTIONNER].includes(mode)) {
            setModeAuthentification(mode)
        }
    }, [setAuthentifierFlag, setAttenteFlag, setModeAuthentification, setCompteRecoveryFlag])

    const reloadCompteUsager = useCallback(()=>{
        const requete = usagerDb.requete || {},
              fingerprintPk = requete.fingerprintPk,
              fingerprintCourant = usagerDb.fingerprintPk
        chargerUsager(nomUsager, fingerprintPk, fingerprintCourant, {genererChallenge: true})
            .then(async usagerWebAuth => {
                const usagerDbMaj = await workers.usagerDao.getUsager(usagerDb.nomUsager)
                setUsagerWebAuth(usagerWebAuth)
                setUsagerDb(usagerDbMaj)
                annulerHandler()
                setAuthentifierFlag(true)
            })
            .catch(err=>console.error("Erreur reload compte usager", err))
    }, [workers, usagerDb, annulerHandler, setAuthentifierFlag, setUsagerWebAuth, setUsagerDb])

    useEffect(()=>{
        usagerDao.getListeUsagers()
            .then(usagers=>{
                usagers.sort()  // Trier liste par nom
                console.debug("Liste usagers locaux (IDB) ", usagers)
                setListeUsagers(usagers)
            })
            .catch(erreurCb)
    }, [setListeUsagers, erreurCb])

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
    }, [workers, modeAuthentification, nomUsager, setAttenteFlag, setUsagerDb, setUsagerWebAuth, erreurCb])

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
    }, [workers, nomUsager, usagerDb, setUsagerDb, setUsagerWebAuth, erreurCb])

    let Page = null

    if(compteRecoveryFlag) {
        Page = CompteRecovery
    } else if(authentifierFlag) {
        Page = Authentifier
    } else {
        switch(modeAuthentification) {
            case MODE_AUTHENTIFICATION_NOUVEL_USAGER: Page = UsagerNouveau; break
            case MODE_AUTHENTIFICATION_SELECTIONNER: Page = UsagerSelectionner; break
            default: 
                Page = PageChargement
        }
    }

    // Layout
    return (
        <Layout>
            <Page 
                listeUsagers={listeUsagers}
                nomUsager={nomUsager}
                setNomUsager={setNomUsager}
                nouvelUsagerToggle={nouvelUsagerToggle}
                authentifierToggle={authentifierToggle}
                compteRecoveryToggle={compteRecoveryToggle}
                attenteFlag={attenteFlag}
                setAttenteFlag={setAttenteFlag}
                dureeSession={dureeSession}
                setDureeSession={setDureeSession}
                reloadCompteUsager={reloadCompteUsager}
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
        listeUsagers, nomUsager, setNomUsager, 
        authentifierToggle, 
        attenteFlag, setAttenteFlag,
        dureeSession, setDureeSession,
        annuler, erreurCb,
    } = props

    return (
        <Form.Group controlId="formNomUsager">
        <InputSaisirNomUsager 
            listeUsagers={listeUsagers}
            onChange={setNomUsager}
            nomInitial={nomUsager}
            attente={attenteFlag}
            setAttente={setAttenteFlag}
            setAuthentifier={authentifierToggle}
            dureeSession={dureeSession}
            setDureeSession={setDureeSession}
            annuler={annuler}
            erreurCb={erreurCb}
            />
        </Form.Group>
    )
}

function UsagerSelectionner(props) {

    const { 
        listeUsagers, nomUsager, setNomUsager, 
        authentifierToggle, nouvelUsagerToggle, compteRecoveryToggle,
        attenteFlag, setAttenteFlag,
        erreurCb,
    } = props

    return (
        <Form.Group controlId="formNomUsager">
            <InputAfficherListeUsagers 
                nomUsager={nomUsager}
                setNomUsager={setNomUsager}
                setNouvelUsager={nouvelUsagerToggle} 
                attente={attenteFlag}
                setAttente={setAttenteFlag}
                authentifierToggle={authentifierToggle}
                listeUsagers={listeUsagers}
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

    if(!usagerDb || (!certificatValide && !usagerDb.requete)) {
        // Generer une nouvelle requete de certificat
        usagerDb = await preparerUsagerLocalDb(nomUsager)
        console.debug("traiterChangementUsager Nouveau certificat genere : ", usagerDb)
    }

    const requete = usagerDb.requete || {},
          fingerprintPk = requete.fingerprintPk,
          fingerprintCourant = usagerDb.fingerprintPk

    // Verifier si un nouveau certificat est disponible sur le serveur
    const reponseUsagerWebAuth = await chargerUsager(
        nomUsager, fingerprintPk, fingerprintCourant, {genererChallenge: true})
    console.debug("traiterChangementUsager SectionAuthentification Charge compte usager : %O", reponseUsagerWebAuth)

    return {mode: MODE_AUTHENTIFICATION_SELECTIONNER, usagerDb, usagerWebAuth: reponseUsagerWebAuth}
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

function detecterPeutActiver(usagerWebAuth) {
    if(!usagerWebAuth || !usagerWebAuth.infoUsager) return false
    const methodesDisponibles = usagerWebAuth.infoUsager.methodesDisponibles || {}
    console.debug("detecterPeutActiver peutActiver methodesDisponibles : ", methodesDisponibles)
    return methodesDisponibles.activation || false
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

function InputSaisirNomUsager(props) {
    const {
        listeUsagers,
        nomInitial, 
        attente, 
        onChange, 
        setAuthentifier, 
        dureeSession, setDureeSession,
        annuler
    } = props

    const {t} = useTranslation()
    const workers = useWorkers()

    const nombreUsagersListe = useMemo(()=>{
        if(!listeUsagers) return 0
        return listeUsagers.length
    }, [listeUsagers])

    const [nom, setNom] = useState(nomInitial)
   
    const nomUsagerOnChangeCb = useCallback(event=>setNom(event.currentTarget.value), [setNom])
    const onChangeDureeSession = useCallback(event=>setDureeSession(event.currentTarget.value), [setDureeSession])

    const suivantCb = useCallback(
        () => {
            console.debug("BoutonsAuthentifier Suivantcb %s", nom)
            onChange(nom)           // useEffect sur SectionAuthentification va reloader webauth et idb
            setAuthentifier(true)   // Lance l'ecran d'inscription ou login
        }, 
        [nom, setAuthentifier, onChange]
    )

    // Rediriger vers mode Selectionner
    const annulerCb = useCallback(()=>annuler(MODE_AUTHENTIFICATION_SELECTIONNER), [annuler])

    useEffect(()=>{
        workers.connexion.clearFormatteurMessage()
            .catch(err=>console.error("InputSaisirNomUsager Erreur clearFormatteurMessages ", err))
    }, [workers])
    
    if(!!props.show) return ''

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
                    <Button disabled={attente || suivantDisabled} onClick={suivantCb}>
                        <Trans>Forms.next</Trans>
                    </Button>
                </Col>
                <Col xs={12} sm={4} >
                    <Button variant="secondary" disabled={true}>
                        <Trans>Forms.new</Trans>
                    </Button>
                </Col>
                <Col xs={12} sm={4}  className="bouton-droite">
                    <Button variant="secondary" onClick={annulerCb} disabled={!nombreUsagersListe}>
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
        authentifierToggle, 
        dureeSession, setDureeSession,
        setCompteRecovery,
        erreurCb,
    } = props

    const {t} = useTranslation()
    const workers = useWorkers()
    const usagerWebAuth = useUsagerWebAuth()[0]

    const peutActiver = useMemo(()=>detecterPeutActiver(usagerWebAuth), [usagerWebAuth])

    const nouvelUsagerHandler = useCallback( () => {
        setNouvelUsager(true)
    }, [setNouvelUsager])

    const usagerOnChange = useCallback(event=>{
        setNomUsager(event.currentTarget.value)
    }, [setNomUsager])

    const onChangeDureeSession = useCallback(event=>setDureeSession(event.currentTarget.value), [setDureeSession])

    const onSuccessWebAuth = useCallback(resultat=>{
        console.debug("InputAfficherListeUsagers onSuccessWebAuth ", resultat)
        // Sauvegarder usager et reconnecter socket.io - active la session http avec /auth
        successWebAuth(workers, resultat, nomUsager)
            .catch(erreurCb)
            .finally(()=>setAttente(false))
    }, [workers, nomUsager, setAttente, erreurCb])

    const erreurAuthCb = useCallback((err, message)=>{
        if(err && ![0, 11, 20].includes(err.code)) {
            erreurCb(err, message)
        } else {
            //console.debug("Erreur authentification annulee/mauvaise cle, on passe au mode recovery")
            setCompteRecovery(true)
            authentifierToggle()
        }
    }, [erreurCb, setCompteRecovery, authentifierToggle])

    const suivantNoAuthCb = useCallback(
        () => {
            console.debug("BoutonsAuthentifier Suivantcb %s", nomUsager)
            try {
                setAttente(true)
                authentifierToggle()
            } catch(err) {
                erreurCb(err)
            } finally {
                setAttente(false)
            }
        }, 
        [nomUsager, setAttente, authentifierToggle, erreurCb]
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

    const buttonVariant = useMemo(()=>{
        if(peutActiver) return 'success'
        return 'primary'
    }, [peutActiver])

    const usagerNoWebAuth = useMemo(()=>{
        console.debug("BoutonAuthentifierListe usagerWebAuth : %O", usagerWebAuth)

        if(usagerWebAuth) {
            const infoUsager = usagerWebAuth.infoUsager || {}
            const methodesDisponibles = infoUsager.methodesDisponibles || {}
            const challengeCertificat = infoUsager.challenge_certificat
            if(!usagerWebAuth.infoUsager) return true  // Compte inexistant (nouveau)
            if(!infoUsager.authentication_challenge) return true  // Aucunes cles webauthn
            if(methodesDisponibles.activation && challengeCertificat) return true  // Bypass webauthn
        }
        return false
    }, [usagerWebAuth])

    const challengeWebauthn = useMemo(()=>{
        if(usagerWebAuth && usagerWebAuth.infoUsager) {
            return usagerWebAuth.infoUsager.authentication_challenge
        }
        return ''
    }, [usagerWebAuth])

    if(usagerNoWebAuth) {
        return (
            <Button variant={buttonVariant} onClick={suivantNoWebauthnHandler}>{props.children}</Button>
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
