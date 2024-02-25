import { useEffect, useCallback, useMemo, lazy } from 'react'
import axios from 'axios'

import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Alert from 'react-bootstrap/Alert'

import { MESSAGE_KINDS } from '@dugrema/millegrilles.utiljs/src/constantes'

import useWorkers, { useFormatteurPret, useUsagerDb, useUsagerWebAuth } from './WorkerContext'

import { BoutonAuthentifierWebauthn } from './WebAuthn'

import { sauvegarderUsagerMaj } from './comptesUtil'

const InscrireUsager = lazy( () => import('./InscrireUsager') )

function Authentifier(props) {

    const {
        setAttenteFlag, 
        nomUsager, dureeSession,
        compteRecoveryToggle,
        annuler, erreurCb
    } = props

    const workers = useWorkers()
    const etatFormatteurPret = useFormatteurPret()

    const [usagerDb, setUsagerDb] = useUsagerDb(),
          usagerWebAuth = useUsagerWebAuth()[0]

    const challengeWebauthn = useMemo(()=>{
        if(usagerWebAuth && usagerWebAuth.infoUsager) {
            const challenge = usagerWebAuth.infoUsager.authentication_challenge
            console.debug("Authentifier.challengeWebauthn ", challenge)
            return challenge
        }
    }, [usagerWebAuth])

    const onSuccessWebAuth = useCallback(resultat=>{
        // Sauvegarder usager et reconnecter socket.io - active la session http avec /auth
        successWebAuth(workers, resultat, nomUsager)
            .then(setUsagerDb)        
            .catch(erreurCb)
            .finally(()=>setAttenteFlag(false))
    }, [workers, nomUsager, annuler, setAttenteFlag, setUsagerDb])

    // Preparer formatteur de messages si applicable
    useEffect(()=>{
        if(!etatFormatteurPret && usagerDb && usagerWebAuth && usagerWebAuth.infoUsager) {
            const infoUsager = usagerWebAuth.infoUsager
            const methodesDisponibles = infoUsager.methodesDisponibles || {}
            const challengeCertificat = infoUsager.challenge_certificat
            const authentication_challenge = infoUsager.authentication_challenge

            if(methodesDisponibles.activation && challengeCertificat) {
                chargerFormatteurCertificat(workers, usagerDb)
                    .catch(err=>console.error("Erreur preparation formatteur certificat", err))
            } else if (!authentication_challenge) {
                console.debug("Aucunes methodes d'authentification (ni certificat, ni webauthn). Toggle recovery.")
                compteRecoveryToggle()
            }
        }
    }, [workers, etatFormatteurPret, usagerDb, usagerWebAuth, compteRecoveryToggle])

    // Authentification automatique si applicable
    useEffect(()=>{
        console.debug("Authentifier formatteurPret %O, usagerWebAuth %O", etatFormatteurPret, usagerWebAuth)
        if(!etatFormatteurPret || !usagerWebAuth || !usagerWebAuth.infoUsager) return

        // Conserver le nomUsager meme en cas d'echec pour reessayer
        window.localStorage.setItem('usager', nomUsager)

        const infoUsager = usagerWebAuth.infoUsager || {}
        const methodesDisponibles = infoUsager.methodesDisponibles
        const challengeCertificat = infoUsager.challenge_certificat
        console.debug("Authentifier methodesDisponibles %O, challengeCertificat : %O", methodesDisponibles, challengeCertificat)
        if(methodesDisponibles.activation && challengeCertificat) {
            console.debug("Authentification avec signature certificat et challenge ", challengeCertificat)

            const data = {certificate_challenge: challengeCertificat, activation: true, dureeSession}
            workers.connexion.formatterMessage(
                MESSAGE_KINDS.KIND_COMMANDE, data, {domaine: 'auth', action: 'authentifier_usager', ajouterCertificat: true}
            )
                .then( async messageSigne => {
                    const resultatAuthentification = await axios.post('/auth/authentifier_usager', messageSigne)
                    const contenu = JSON.parse(resultatAuthentification.data.contenu)
                    console.debug("Resultat authentification ", resultatAuthentification)
                    if(!!contenu.auth) {
                        await workers.connexion.deconnecter()
                        await workers.connexion.connecter()
                        annuler()
                    } else {
                        erreurCb(`Erreur authentification : ${contenu.err}`)
                    }
                })
                .catch(erreurCb)
        }
    }, [workers, etatFormatteurPret, usagerWebAuth, annuler, nomUsager, challengeWebauthn])

    let message = <p>Ouverture d'une nouvelle session en cours ... <i className="fa fa-spinner fa-spin fa-fw" /></p>
    if(challengeWebauthn) message = 'Cliquez sur Suivant pour vous connecter.'

    if(usagerWebAuth && !usagerWebAuth.infoUsager) {
        // Le compte usager n'existe pas sur le serveur. 
        return <InscrireUsager {...props} />
    }

    return (
        <>
            <Alert variant="info">
                <Alert.Heading>Ouverture de session</Alert.Heading>
                
                {message}
            </Alert>

            <Row className='buttonbar'>
                <Col className="button-list">
                    {(usagerDb && challengeWebauthn)?
                        <BoutonAuthentifierWebauthn 
                            nomUsager={nomUsager}
                            usagerDb={usagerDb}
                            challenge={challengeWebauthn}
                            setAttente={setAttenteFlag}
                            onSuccess={onSuccessWebAuth}
                            onError={erreurCb}
                            dureeSession={dureeSession}>
                            Suivant
                        </BoutonAuthentifierWebauthn>
                    :''}
                    <Button variant="secondary" onClick={compteRecoveryToggle}>Utiliser un code</Button>
                    <Button variant="secondary" onClick={annuler}>Annuler</Button>
                </Col>
            </Row>
        </>
    )
}

export default Authentifier

export async function successWebAuth(workers, resultat, nomUsager) {
    console.debug("successWebAuth ", resultat)

    const params = {...resultat, nomUsager}

    const usagerDb = await sauvegarderUsagerMaj(workers, params)
    if(!!resultat.auth) {
        console.info("successWebAuth Reconnecter %s pour authentification socket.io", nomUsager)

        console.info("successWebAuth Auth OK pour :", nomUsager)
        window.localStorage.setItem('usager', nomUsager)

        // Activer session via module /webauth (cookies, etc.) en se reconnectant
        await workers.connexion.deconnecter()
        await workers.connexion.connecter()
        return usagerDb
    } else {
        throw new Error('Echec Authentification')
    }
}

async function chargerFormatteurCertificat(workers, usagerDb) {
    console.debug("Preparer formatteur de messages pour usager %O", usagerDb)
    const connexion = workers.connexion
    const { certificat, clePriveePem } = usagerDb
    if(connexion && certificat && clePriveePem) {
        await connexion.initialiserFormatteurMessage(certificat, clePriveePem)
        return true
    } else {
        await connexion.clearFormatteurMessage()
        return false
    }
}
