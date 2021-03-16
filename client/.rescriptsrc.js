/*
  Info sur raison d'utilisation (multiple web workers).

  https://www.npmjs.com/package/worker-loader#worker
  https://webpack.js.org/concepts/loaders/
  https://dev.to/talolard/using-multiple-webworkers-with-create-react-app-246b
  https://github.com/harrysolovay/rescripts#2-define-a-rescripts-field-and-specify-which-to-use
*/

function makeMultipleWebworkersWork(config){
    // Change the output file format so that each worker gets a unique name
    config.output.filename = 'static/js/[name].bundle.js'
    // Now, we add a rule for processing workers
    const newRules = [{

        test: /\.worker\.(c|m)?[tj]s$/i,
        type: "javascript/auto",
        include:  config.module.rules[1].include,
        use: [
            {
                loader: "worker-loader",
            },
            {
                loader: "babel-loader",
                options: {
                    presets: ["@babel/preset-env"],
                },
            },
        ],
        // Here we append all the old rules
    },...config.module.rules]
    // now update Webpack's config with the new rules
    config.module.rules = newRules
    return config
}

module.exports =[
    makeMultipleWebworkersWork,
]
