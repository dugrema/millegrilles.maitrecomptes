const webpack = require('webpack');

function override(config, env) {
    const fallback = config.resolve.fallback || {};
    Object.assign(fallback, {
        // assert: 'assert/',  // require.resolve('assert/'),
        buffer: 'buffer/', //require.resolve('buffer/'),
        crypto: 'crypto-browserify/',  // require.resolve('crypto-browserify/'),
        // fs: require.resolve('fs/'),
        // http: 'stream-http/',  // require.resolve('stream-http/'),
        // https: 'https-browserify/',  // require.resolve('https-browserify/'),
        // os: 'os-browserify/',   // require.resolve('os-browserify/'),
        path: 'path-browserify/',   // require.resolve('os-browserify/'),
        stream: 'stream-browserify/',  // require.resolve('stream-browserify/'),
        // url: 'url/',  // require.resolve('url/')
    })
    config.resolve.fallback = fallback;
    
    let plugins = config.plugins || [];
    plugins.push(
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
        })
    );
    config.plugins = plugins

    console.debug("Plugins : %O", plugins)

    return config;
}

function devServer(configFunction) {
    return function(proxy, allowedHost) {
        // Create the default config by calling configFunction with the proxy/allowedHost parameters
        const config = configFunction(proxy, allowedHost);

        // Passer parametres
        config.webSocketServer = config.webSocketServer || {}
        config.webSocketServer.options = {
            ...config.webSocketServer.options,
            path: process.env.WDS_SOCKET_PATH,
            host: process.env.WDS_SOCKET_HOST,
            port: process.env.WDS_SOCKET_PORT,
        }

        console.debug('Config dev : %O', config)

        // Return your customised Webpack Development Server config.
        return config;
    };
}

module.exports = { webpack: override, devServer }