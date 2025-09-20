const crypto = require("crypto") //crypto bit is used to generate random number

const generateToken = () =>{
    return crypto.randomBytes(32).toString("hex")
}
module.exports = generateToken