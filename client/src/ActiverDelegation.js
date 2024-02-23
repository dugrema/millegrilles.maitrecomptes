import { useState, useEffect } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'

import { useTranslation } from 'react-i18next'

import ChargerCleMillegrille, {authentiferCleMillegrille} from './ChargerCleMillegrille'
import {getUserIdFromCertificat} from './comptesUtil'

import useWorkers, {useUsagerDb, useVersionCertificat} from './WorkerContext'
import { BoutonMajCertificatWebauthn } from './WebAuthn'

function SectionActiverDelegation(props) {

    useEffect(()=>console.info("SectionActiverDelegation PROPPIES ", props), [props])

    const {
        confirmationCb, 
        erreurCb, fermer
    } = props

    const { t } = useTranslation()
    const workers = useWorkers(),
          usagerDb = useUsagerDb()[0]

    const setVersionCertificat = useVersionCertificat()[1]
    const [cleMillegrille, setCleMillegrille] = useState('')
    const [resultat, setResultat] = useState('')
    const [challenge, setChallenge] = useState('')

    useEffect(()=>{
        if(!cleMillegrille || !challenge) return
        if(resultat === true) return   // Eviter generer certificat plusieurs fois
        activerDelegation(workers, usagerDb, challenge, cleMillegrille)
            .then(reponse=>{
                console.debug("Reponse activer delegation ", reponse)
                setResultat(true)
                const { delegations_date, delegations_version } = reponse
                setVersionCertificat({ delegations_date, delegations_version })
            })
            .then(()=>{
                // confirmationCb('Delegation completee avec succes. Le certificat de compte proprietaire est maintenant installe.')
                confirmationCb('Delegation completee avec succes.')
                fermer()
            })
            .catch(erreurCb)
    }, [workers, resultat, usagerDb, setResultat, challenge, cleMillegrille, setVersionCertificat, confirmationCb, erreurCb, fermer])

    // Charger un nouveau challenge de delegation
    useEffect(()=>{
        const hostname = window.location.hostname
        workers.connexion.genererChallenge({
            hostname, delegation: true
        })
            .then(reponseChallenge=>{
                console.debug("Recu challenge de delegation : ", reponseChallenge)
                setChallenge(reponseChallenge.delegation_challenge)
            })
            .catch(err=>{
                erreurCb(err, 'Erreur reception challenge de delegation du serveur')
                fermer()
            })
    }, [workers, usagerDb, setChallenge, erreurCb, fermer])

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

                <p></p>

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
        nomUsager,
        hostname: window.location.hostname,
    }
    console.debug("Commande activer delegation : %O", commande)

    const reponse = await connexion.activerDelegationParCleMillegrille(commande)
    if(reponse.err) throw new Error(reponse.err)

    return reponse
}
