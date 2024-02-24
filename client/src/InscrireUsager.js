import {useState, useCallback} from 'react'

import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'

import { Trans, useTranslation } from 'react-i18next'

import { BoutonActif, usagerDao } from '@dugrema/millegrilles.reactjs'

import useWorkers, { useUsagerDb } from './WorkerContext'

import { sauvegarderCertificatPem, initialiserCompteUsager } from './comptesUtil'

function InscrireUsager(props) {
    // console.debug("!! InscrireUsager %O", props)
    const { nomUsager, annuler, erreurCb } = props
    const { t } = useTranslation()
    const workers = useWorkers()
    const setUsagerDb = useUsagerDb()[1]

    const [etatBouton, setEtatBouton] = useState('')

    const onClickSuivant = useCallback( () => {
        setEtatBouton('attente')
        suivantInscrire(workers, nomUsager, setUsagerDb, erreurCb)
            .then(async () => {
                setEtatBouton('succes')

                // Authentifier la connexion socket.io avec la session
                await workers.connexion.deconnecter()
                await workers.connexion.connecter()
            })
            .catch(err=>{
                setEtatBouton('echec')
                erreurCb(err)
            })
    }, [workers, nomUsager, setUsagerDb, setEtatBouton, erreurCb])

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
                        <Button variant="secondary" onClick={annuler}>
                            <Trans>Forms.cancel</Trans>
                        </Button>
                    </Col>
                </Row>
            </div>
        </>
    )
}

export default InscrireUsager

async function suivantInscrire(workers, nomUsager, setUsagerDb, erreurCb) {
    // console.debug("suivantInscrire Inscrire ", nomUsager)
    try {
        const {connexion} = workers
        const usagerInit = await initialiserCompteUsager(nomUsager)
        const requete = usagerInit.requete || {}
        const { csr, clePriveePem, fingerprintPk } = requete
 
        console.debug("suivantInscrire Inscrire usager %s avec CSR navigateur\n%O", nomUsager, csr)
        const reponseInscription = await connexion.inscrireUsager(nomUsager, csr)
        console.debug("suivantInscrire Reponse inscription : %O", reponseInscription)
      
        if(reponseInscription.ok !== true) {
            console.warn("Erreur inscription usager : ", reponseInscription)
            throw new Error(`Erreur inscription usager : ${reponseInscription}`)
        }

        // Enregistrer le certificat dans IndexedDB
        const certificatChaine = reponseInscription.certificat

        if(!certificatChaine) {
            erreurCb("Le certificat n'a pas ete recu lors de la confirmation d'inscription.", "L'inscription a echouee")
            return
        }

        // Injecter delegations_version: 1 au besoin
        const delegations_version = reponseInscription.delegations_version || 1
        reponseInscription.delegations_version = delegations_version

        console.debug("suivantInscrire Certificats recus : cert: %O", certificatChaine)
        await sauvegarderCertificatPem(nomUsager, certificatChaine, {clePriveePem, fingerprintPk, delegations_version})
      
        // Recharger usager, applique le nouveau certificat
        const usagerDbLocal = await usagerDao.getUsager(nomUsager)
        await setUsagerDb(usagerDbLocal)

        // Conserver usager selectionne pour reload
        window.localStorage.setItem('usager', nomUsager)

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
