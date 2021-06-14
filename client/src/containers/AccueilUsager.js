import React from 'react'
import {Button} from 'react-bootstrap'

import {AlertAjouterAuthentification} from './Authentifier'
import GestionCompte from './GestionCompte'

export default function AccueilUsager(props) {

  return (
    <>
      <AlertAjouterAuthentification workers={props.workers}
                                    rootProps={props.rootProps} />

      <p>Accueil usager {props.rootProps.nomUsager}</p>
      <Button variant="secondary" onClick={props.rootProps.deconnecter}>Deconnecter</Button>

      <GestionCompte workers={props.workers}
                     rootProps={props.rootProps} />

    </>
  )
}
