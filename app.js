const express = require('express')
const bodyParser = require('body-parser');
const cors = require('cors');
const Arweave = require('arweave/node');

const app = express();
const port = 3000;


// Quick checker for arrays equality
// Warn if overriding existing method
if(Array.prototype.equals)
    console.warn("Overriding existing Array.prototype.equals. Possible causes: New API defines the method, there's a framework conflict or you've got double inclusions in your code.");
// attach the .equals method to Array's prototype to call it on any array
Array.prototype.equals = function (array) {
    // if the other array is a falsy value, return
    if (!array)
        return false;

    // compare lengths - can save a lot of time 
    if (this.length != array.length)
        return false;

    for (var i = 0, l=this.length; i < l; i++) {
        // Check if we have nested arrays
        if (this[i] instanceof Array && array[i] instanceof Array) {
            // recurse into the nested arrays
            if (!this[i].equals(array[i]))
                return false;       
        }           
        else if (this[i] != array[i]) { 
            // Warning - two different object instances will never be equal: {x:20} != {x:20}
            return false;   
        }           
    }       
    return true;
}
// Hide method from for-in loops
Object.defineProperty(Array.prototype, "equals", {enumerable: false});



const arweave = Arweave.init({
    host: 'arweave.net',// Hostname or IP address for a Arweave host
    port: 443,          // Port
    protocol: 'https',  // Network protocol http or https
    timeout: 20000,     // Network request timeouts in milliseconds
    logging: false,     // Enable network request logging
    });
const KEY = require("./hot-wallet.js");
arweave.wallets.jwkToAddress(KEY).then((address) => {
    console.log(address);
});
const ADDRESS = "V4bRN4sWWb9NgiBr3PsauIUiMiVQpu6DWoJ_nMxw_pk";
console.log(ADDRESS);
const TEST_ACCOUNT = "0x0230c6dD5DB1d3F871386A3CE1A5a836b2590044";
const MAX_DATA_LENGHT = 100;






async function loadLatest(userAccount) {
    const txids = await arweave.arql({
        op: "equals",
        expr1: "account",
        expr2: userAccount
    })
    console.log(txids);
    return arweave.transactions.getData(txids[0], {decode: true, string: true});
}

async function uploadPaths(userAccount, paths) {
    console.log("store-dev");
    
    let transaction = await arweave.createTransaction({
        data: paths
    }, KEY);
    transaction.addTag('account', userAccount);
    
    await arweave.transactions.sign(transaction, KEY);
    console.log("transaction", transaction);
    const response = await arweave.transactions.post(transaction);
    console.log("response.status", response.status);
}

function getValidPaths(candidateString) {
    let paths;
    try {
        paths = JSON.parse(candidateString).paths;
    } catch (e) {
        return undefined;
    }

    if (candidateString.length > MAX_DATA_LENGHT) {
        return undefined;
    };
    return paths;
}

function getUpdatedPaths(oldPaths, newPaths) {
    if (oldPaths == undefined || oldPaths.length == 0) {
        return newPaths;
    }
    let updatedPaths = [];
    for (let i in newPaths) {
        let pathIsKnown;
        for (let j in oldPaths) {
            if (newPaths[i].equals(oldPaths[j])) {
                pathIsKnown = true;
            }
        }
        if (!pathIsKnown) {
            updatedPaths.push(newPaths[i]);
        }
    }
    
    // store if new
    if (updatedPaths.length > 0) {
        return oldPaths.concat(updatedPaths)
    }
    return [];
}


app.use(cors());

// Configuring body parser middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


app.post('/store', async (req, res) => {
    let pathsToStoreJSON = req.body.paths;
    const userAccount = req.body.account;

    // check validity
    // pathsToStoreJSON = '{ "paths" : [[1,4],[2,4]] }';
    let pathsToStore = getValidPaths(pathsToStoreJSON);
    if (!pathsToStore) {
        res.status(400).json({success: false, error: "Worng paths"});
    }
    
    // check if already stored
    let knownPathsJSON = await loadLatest(userAccount);
    // let knownPathsJSON = '{ "paths" : [[2,4]] }';
    let knownPaths = getValidPaths(knownPathsJSON);

    let updatedPaths = getUpdatedPaths(knownPaths, pathsToStore);
    if (updatedPaths.length > 0) {
        var obj = new Object();
        obj.paths = updatedPaths;
        var updatedPathsJSON = JSON.stringify(obj);
        console.log("updatedPaths: ", updatedPathsJSON);
        uploadPaths(userAccount, updatedPathsJSON);
    }

    res.send(updatedPaths);
});

app.get('/load/:account', async (req, res) => {
    const userAccount = req.params.account;
    const paths = await loadLatest(userAccount);
    console.log(paths);
    res.json(paths);
});

app.listen(port, () => console.log(`Listening on port ${port}!`));