import React, {useState, useEffect, useCallback} from 'react'
import { Modal } from 'react-bootstrap'

import { repondreRegistrationChallenge } from '@dugrema/millegrilles.common/lib/browser/webauthn'

export function ModalAjouterWebauthn(props) {

  const connexion = props.workers.connexion

  useEffect(async _ => {
    if(props.show) {
      const nomUsager = props.rootProps.nomUsager

      console.debug("Activer registration webauthn pour %s", nomUsager)
      const challenge = await connexion.declencherAjoutWebauthn()
      const reponseChallenge = await repondreRegistrationChallenge(nomUsager, challenge, {DEBUG: true})

      const params = {
        // desactiverAutres: this.state.desactiverAutres,
        reponseChallenge
      }

      console.debug("reponseChallenge : %O", params)
      const resultatAjout = await connexion.repondreChallengeRegistrationWebauthn(params)
      console.debug("Resultat ajout : %O", resultatAjout)
    }
  }, [props.show])

  return (
    <Modal show={props.show} onHide={props.hide}>
      <Modal.Header closeButton>Ajouter methode d'authentification</Modal.Header>
      <Modal.Body>
        <p>Ajouter token...</p>
      </Modal.Body>
    </Modal>
  )
}
