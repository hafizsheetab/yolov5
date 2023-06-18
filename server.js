const express = require("express")
require("dotenv").config()
const cors = require("cors");
const detect = require("./detectNid");
const app = express()
app.use(cors())
app.use(express.json({extende: false}))
app.post("/detect/nid", async (req, res) => {
    try {
        const { imgUri } = req.body
        const response = await detect(imgUri)
        res.json(response)
    }
    catch (err) {
        console.log(err)
        res.status(400).json({
            error: {
                message: err.message
            }
        })
    }
})
app.listen(5000, () => {
    console.log("Nid Detection API Listening on port: 5000")
})