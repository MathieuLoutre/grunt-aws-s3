#!/bin/bash
function generateCopies {
  for i in `seq 2 $1`; do
    touch "$2 $i.txt"
  done
}

function generateFixtures {
  mkdir -p test/fixtures/upload/otters/$3
  touch "test/fixtures/upload/otters/$3/$2".txt
  touch "test/fixtures/upload/otters/$3/$2 copy".txt
  generateCopies $1 "test/fixtures/upload/otters/$3/$2 copy"
}

# $1 = number of elements
# $2 = name of file
# $3 = name of folder

mkdir -p test/fixtures/upload/otters/{river,sea,updated}
echo My favourite animal > test/fixtures/upload/otters/animal.txt
generateFixtures 911 yay river
generateFixtures 559 yo sea
generateFixtures 911 yay updated
generateFixtures 559 yo updated
