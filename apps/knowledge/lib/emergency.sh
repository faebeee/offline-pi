#!/usr/bin/env bash
# lib/emergency.sh - curated subset of the Kiwix catalog relevant to
# emergency/survival scenarios (medical, food & water, shelter/repair,
# general prepping). This is what install.sh and `manage.sh add` show by
# default instead of the full multi-thousand-entry catalog.
#
# Each row is "<zim name>|<display group>". The zim name is the catalog's
# <name> field (stable across flavours/updates); the group is just used to
# label the picker. Extend this list as new relevant ZIMs show up at
# https://library.kiwix.org/ (categories "other"/"wikipedia", informal tags
# like preppers/medical/food/lowtech are good places to look).
EMERGENCY_ZIMS=(
  # --- Medical / First Aid ---------------------------------------------
  "wikipedia_en_medicine|Medical"
  "irp.fas.org_en_military-medicine|Medical"
  "nhs.uk_en_medicines|Medical"
  "medlineplus.gov_en_all|Medical"
  "wwwnc.cdc.gov_en_all|Medical"

  # --- Food & Water ------------------------------------------------------
  "foss.cooking_en_all|Food & Water"
  "publicdomainrecipes.com_en_all|Food & Water"
  "based.cooking_en_all|Food & Water"

  # --- Shelter / Repair / Off-grid skills --------------------------------
  "ifixit_en_all|Shelter & Repair"
  "solar.lowtechmagazine.com_mul_all|Shelter & Repair"
  "100r.co_en_all|Shelter & Repair"
  "cd3wdproject.org_en_all|Shelter & Repair"

  # --- General survival / prepper -----------------------------------------
  # NB: survivorlibrary.com is ~220 GB across all its articles/media -
  # make sure CONTENT_DIR has the room before picking it.
  "survivorlibrary.com_en_all|General Survival"
  "trueprepper.com_en_all|General Survival"
  "ready.gov_en_all|General Survival"
  "rabbitwaves.ca_en_all|General Survival"

  # --- General reference fallback -----------------------------------------
  "wikipedia_en-simple_all|General Reference"
)

# emergency_zim_names - print just the bare catalog names, one per line.
emergency_zim_names() {
  local row
  for row in "${EMERGENCY_ZIMS[@]}"; do
    echo "${row%%|*}"
  done
}

# emergency_zim_group <name> - print the display group for a curated name,
# or nothing if it's not in the curated list.
emergency_zim_group() {
  local name="$1"
  local row row_name row_group
  for row in "${EMERGENCY_ZIMS[@]}"; do
    row_name="${row%%|*}"
    row_group="${row#*|}"
    if [[ "$row_name" == "$name" ]]; then
      echo "$row_group"
      return 0
    fi
  done
  return 1
}
