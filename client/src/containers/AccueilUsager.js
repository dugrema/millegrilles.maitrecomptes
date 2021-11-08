import React, {useState, useCallback} from 'react'
import { Button } from 'react-bootstrap'

import { AlertAjouterAuthentification } from './Authentifier'
import Applications from './Applications'
const GestionCompte = React.lazy( _ => import('./GestionCompte') )

export default function AccueilUsager(props) {
  console.debug("AccueilUsager proppys: %O", props)

  const page = props.page

  let sectionElem = null
  switch(page) {
    case 'GestionCompte':
      sectionElem = (
        <GestionCompte
          workers={props.workers}
          rootProps={props.rootProps} />
      )
      break
    default:
      sectionElem = (
        <Applications
          workers={props.workers}
          rootProps={props.rootProps} />
      )
  }

  return (
    <>

      <AlertAjouterAuthentification
        workers={props.workers}
        rootProps={props.rootProps} />

      {sectionElem}

    </>
  )
}
