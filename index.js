import EntriesImporter from './src/entries-importer.js'
import inquirer from 'inquirer'

const questions = [
  {
    type: 'input',
    name: 'oauth',
    message: "Please enter your OAUTH Token",
  },
  {
    type: 'input',
    name: 'input_file',
    message: "Please enter the input file path",
    default: 'data/in.csv'
  },
  {
    type: 'input',
    name: 'space_id',
    message: "Please enter the Space Id",
  },
  {
    type: 'input',
    name: 'folder_id',
    message: "Please enter the Folder Id",
  },
]

inquirer.prompt(questions).then((answers) => {
  const data_import = new EntriesImporter(answers.oauth, answers.input_file, answers.space_id, answers.folder_id)
  data_import.start()
})
