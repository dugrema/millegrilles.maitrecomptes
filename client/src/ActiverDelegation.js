import { useState, useCallback, useEffect } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'

import { useTranslation } from 'react-i18next'

import ChargerCleMillegrille, {authentiferCleMillegrille} from './ChargerCleMillegrille'
import {getUserIdFromCertificat} from './comptesUtil'

import useWorkers, {useEtatConnexion, WorkerProvider, useUsager, useEtatPret, useInfoConnexion} from './WorkerContext'
import { BoutonMajCertificatWebauthn } from './WebAuthn'

function SectionActiverDelegation(props) {

    useEffect(()=>console.info("SectionActiverDelegation PROPPIES ", props), [props])

    const {
        confirmationCb, 
        erreurCb, fermer
    } = props

    const { t } = useTranslation()
    const workers = useWorkers(),
          usager = useUsager()

    const [cleMillegrille, setCleMillegrille] = useState('')
    const [resultat, setResultat] = useState('')
    const [challenge, setChallenge] = useState('')

    // const [versionObsolete, setVersionObsolete] = useState(false)
    // const [compteUsagerServeur, setCompteUsagerServeur] = useState('')

    // const confirmationNouveauCertificat = useCallback(()=>{
    //     if(confirmationCb) confirmationCb()
    //     setResultat(true)
    //     console.debug("Confirmation nouveau certificat, recharger compte usager pour confirmer version")
    // }, [confirmationCb, setResultat])

    useEffect(()=>{
        if(!cleMillegrille || !challenge) return
        if(resultat === true) return   // Eviter generer certificat plusieurs fois
        activerDelegation(workers, usager, challenge, cleMillegrille)
            .then(()=>setResultat(true))
            .then(()=>{
                confirmationCb('Delegation completee avec succes. Le certificat de compte proprietaire est maintenant installe.')
                fermer()
            })
            .catch(erreurCb)
    }, [workers, resultat, usager, setResultat, challenge, cleMillegrille, confirmationCb, erreurCb, fermer])

    // Charger un nouveau challenge de delegation
    useEffect(()=>{
        workers.connexion.getChallengeDelegation()
            .then(reponseChallenge=>{
                console.debug("Recu challenge de delegation : ", reponseChallenge)
                setChallenge(reponseChallenge.challenge)
            })
            .catch(err=>{
                erreurCb(err, 'Erreur reception challenge de delegation du serveur')
                fermer()
            })
    }, [workers, setChallenge, erreurCb, fermer])

    // useEffect(()=>{
    //     console.debug("UsagerDBLocal : %O, compteUsagerServeur : %O", usager, compteUsagerServeur)
    //     if(compteUsagerServeur && usager) {
    //         const versionLocale = usager.delegations_version,
    //             versionBackend = compteUsagerServeur.delegations_version
  
    //         if(!versionBackend) {
    //             setVersionObsolete(false)  // Desactiver si on n'a pas d'info du backend
    //         } else {
    //             setVersionObsolete(versionLocale !== versionBackend)
    //         }
    //     }
    // }, [usager, compteUsagerServeur])

    return (
        <Row>
            <Col xs={0} sm={1} md={2} lg={3}></Col>
            <Col xs={12} sm={10} md={8} lg={6}>
                <Row>
                    <Col xs={10} md={11}>
                        <h2>{t('ActiverDelegation.titre')}</h2>
                    </Col>
                    <Col xs={2} md={1} className="bouton">
                        <Button onClick={fermer} variant="secondary"><i className='fa fa-remove'/></Button>
                    </Col>
                </Row>

                <p>{t('ActiverDelegation.description')}</p>

                <ChargerCleMillegrille 
                    setCleMillegrille={setCleMillegrille}
                    erreurCb={erreurCb} />

                {/* <SectionRecupererCertificat 
                    show={versionObsolete}
                    workers={workers}
                    cleMillegrille={cleMillegrille}
                    usagerDbLocal={usager}
                    confirmationCb={confirmationNouveauCertificat} 
                    erreurCb={erreurCb} /> */}

                <p></p>

                {/* <Alert show={resultat} variant='dark'>
                    <Alert.Heading>Delegation completee</Alert.Heading>
                    <p>Delegation completee avec succes. Le certificat de compte proprietaire est maintenant installe.</p>
                </Alert> */}
            </Col>
        </Row>
    )
}

export default SectionActiverDelegation

async function activerDelegation(workers, usagerDbLocal, challenge, cleMillegrille) {

    const { connexion } = workers
    const { nomUsager, certificat } = usagerDbLocal

    const userId = getUserIdFromCertificat(certificat.join(''))

    const preuve = await authentiferCleMillegrille(nomUsager, cleMillegrille, {challenge, userId, activerDelegation: true})
    console.debug("Preuve signee : %O", preuve)

    const commande = {
        confirmation: preuve,
        userId,
    }
    console.debug("Commande activer delegation : %O", commande)

    const reponse = await connexion.activerDelegationParCleMillegrille(commande)
    if(reponse.err) throw new Error(reponse.err)

    return reponse
}

function SectionRecupererCertificat(props) {

    const { show, usagerDbLocal, confirmationCb, erreurCb } = props
    const { t } = useTranslation()

    if(!show) return ''  // Certificat n'est pas pret

    return (
        <div>
            <hr />

            <Alert show={true} variant="dark">
                <Alert.Heading>{t('ActiverDelegation.certificat-pret-titre')}</Alert.Heading>
                {t('ActiverDelegation.certificat-pret-description')}
            </Alert>

            <BoutonMajCertificatWebauthn 
              usagerDbLocal={usagerDbLocal}
              confirmationCb={confirmationCb}
              onError={erreurCb}            
              variant="secondary">
                Mettre a jour
            </BoutonMajCertificatWebauthn>

        </div>
    )

}