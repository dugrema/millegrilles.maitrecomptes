import React from 'react'
import {Button} from 'react-bootstrap'

import {AlertAjouterAuthentification} from './Authentifier'
import GestionCompte from './GestionCompte'
import Applications from './Applications'

export default function AccueilUsager(props) {

  return (
    <>
      <AlertAjouterAuthentification workers={props.workers}
                                    rootProps={props.rootProps} />

      <GestionCompte workers={props.workers}
                     rootProps={props.rootProps} />

      <Applications workers={props.workers}
                    rootProps={props.rootProps} />

    </>
  )
}
