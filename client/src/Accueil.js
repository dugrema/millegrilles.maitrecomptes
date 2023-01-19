import Applications from './Applications'

import useWorkers, {useEtatConnexion, WorkerProvider, useUsager, useEtatPret, useInfoConnexion} from './WorkerContext'

function Accueil(props) {

    // console.debug("Accueil proppies ", props)

    const { 
        // workers, 
        // etatAuthentifie, 
        // infoUsagerBackend, 
        // usagerDbLocal, 
        // usagerExtensions, 
        // setUsagerDbLocal, 
        // resultatAuthentificationUsager, 
        setSectionAfficher,
        erreurCb, 
    } = props

    const etatPret = useEtatPret()

    if(!etatPret) return 'Accueil - Chargement en cours'

    return (
        <Applications 
            // workers={workers} 
            // etatAuthentifie={etatAuthentifie}
            // usagerDbLocal={usagerDbLocal}
            // infoUsagerBackend={infoUsagerBackend}
            // usagerExtensions={usagerExtensions} 
            // resultatAuthentificationUsager={resultatAuthentificationUsager}
            setSectionAfficher={setSectionAfficher} 
            // setUsagerDbLocal={setUsagerDbLocal}
            erreurCb={erreurCb} 
          />
    )
}

export default Accueil
