// The jobs Done & Paid's models are trained on: US home-service tasks (plumbing first, then cleaning and handyman),
// each with its work items, its done-conditions (checks) and what evidence proves each one, prices and parts. Code
// draws jobs from here, so the scope, the evidence and the right verdict of every check are known before any model
// sees them. Everything is fictional (demo city Austin, TX).
//
// A check: { id, what (the done-condition, as the work order states it), evidence: "photo" | "receipt" | "note",
//   rule (how it is checked), show (what a photo that passes shows), bad (what a photo that fails shows) }

export const TASKS = [
  // ---- plumbing (the main line)
  { id: "faucet_cartridge", trade: "plumbing", title: "Fix a dripping kitchen faucet", ask: ["my kitchen faucet keeps dripping", "the kitchen tap drips all night", "kitchen sink faucet is leaking from the spout"],
    items: ["Replace the faucet cartridge", "Test the faucet for drips", "Clean up the work area"], labor: [120, 220], part: { name: "faucet cartridge", price: [18, 45] },
    checks: [
      { id: "new_cartridge", what: "A new cartridge is installed", evidence: "photo", rule: "A photo shows the new cartridge in the faucet body, with the old one beside it or removed", show: "the new cartridge seated in the faucet body, the old worn cartridge on the counter", bad: "the old corroded cartridge still in the faucet body" },
      { id: "no_drip", what: "No drip 10 minutes after shut-off", evidence: "photo", rule: "A photo taken at least 10 minutes after shut-off shows a dry spout and dry basin", show: "the faucet shut off and the spout and basin completely dry, a phone timer reading 10:12 next to it", bad: "a drop of water hanging from the spout and wet spots in the basin" },
      { id: "parts_receipt", what: "Receipt for the parts", evidence: "receipt", rule: "A receipt lists the cartridge, is dated within the job window, and its total is within the parts allowance" },
      { id: "cleanup", what: "Work area left clean", evidence: "photo", rule: "A photo shows the sink area clean, dry and clear of tools and old parts", show: "the sink and counter wiped clean, no tools or old parts left", bad: "tools, a wet towel and the old parts left on the counter" } ] },
  { id: "toilet_fill_valve", trade: "plumbing", title: "Stop a running toilet", ask: ["the toilet keeps running after every flush", "my toilet won't stop filling", "toilet runs nonstop and wastes water"],
    items: ["Replace the fill valve and flapper", "Adjust the water level", "Check that the tank stops filling"], labor: [110, 200], part: { name: "fill valve and flapper kit", price: [15, 35] },
    checks: [
      { id: "new_valve", what: "New fill valve and flapper installed", evidence: "photo", rule: "A photo inside the tank shows the new fill valve and flapper", show: "inside the tank: a new fill valve and a new red flapper", bad: "inside the tank: the old mineral-crusted fill valve and a warped flapper" },
      { id: "stops_filling", what: "Tank stops filling after a flush", evidence: "photo", rule: "A photo after a flush shows the water level at the fill line with the valve shut", show: "the tank refilled to the marked fill line and the water still", bad: "water still trickling into the overflow tube after the refill" },
      { id: "parts_receipt", what: "Receipt for the parts", evidence: "receipt", rule: "A receipt lists the fill valve kit, is dated within the job window, and its total is within the parts allowance" } ] },
  { id: "drain_clog", trade: "plumbing", title: "Clear a clogged bathroom sink drain", ask: ["the bathroom sink drains really slowly", "bathroom sink is clogged", "water sits in my bathroom sink for minutes"],
    items: ["Clear the drain and trap", "Run water to confirm it drains", "Clean up"], labor: [90, 180], part: null,
    checks: [
      { id: "drains_freely", what: "Sink drains freely", evidence: "photo", rule: "A photo right after running water for a minute shows an empty basin", show: "the basin empty right after the tap ran for a minute, water swirling down the drain", bad: "standing gray water in the basin after the tap ran" },
      { id: "trap_reassembled", what: "P-trap reassembled with no leak", evidence: "photo", rule: "A photo under the sink shows the trap connected and dry", show: "under the sink: the P-trap reconnected, the joints dry, a dry paper towel beneath", bad: "under the sink: the P-trap loose and a puddle on the cabinet floor" },
      { id: "cleanup", what: "Work area left clean", evidence: "photo", rule: "A photo shows the cabinet and floor clean and dry", show: "the cabinet and floor clean and dry, the bucket gone", bad: "a bucket of dirty water and hair clumps left in the cabinet" } ] },
  { id: "disposal_replace", trade: "plumbing", title: "Replace a broken garbage disposal", ask: ["my garbage disposal just hums and won't spin", "the disposal is dead, need a new one put in", "garbage disposal leaks from the bottom"],
    items: ["Remove the old disposal", "Install a new 1/2 HP disposal", "Test it with water running"], labor: [150, 260], part: { name: "1/2 HP garbage disposal", price: [90, 160] },
    checks: [
      { id: "new_unit", what: "New disposal installed", evidence: "photo", rule: "A photo under the sink shows the new unit mounted and connected", show: "under the sink: a new disposal unit mounted, the drain line and cord connected", bad: "under the sink: the old rusty disposal still mounted" },
      { id: "runs_no_leak", what: "Runs with no leak", evidence: "note", rule: "The pro's note says it was run with water and nothing leaked, and a photo or note shows a dry cabinet", show: "ran it with cold water for 30 seconds, it spins and drains, cabinet stayed dry", bad: "it runs but drips from the bottom flange" },
      { id: "parts_receipt", what: "Receipt for the disposal", evidence: "receipt", rule: "A receipt lists the disposal, is dated within the job window, and its total is within the parts allowance" } ] },
  // ---- cleaning
  { id: "deep_clean", trade: "cleaning", title: "Deep clean a 1-bedroom apartment", ask: ["need a deep clean of my one-bedroom apartment", "my 1BR needs a top-to-bottom cleaning", "deep clean before my parents visit"],
    items: ["Clean the kitchen counters, stove and sink", "Clean the bathroom: tub, toilet, sink, mirror", "Vacuum and mop all floors", "Take out the trash"], labor: [140, 260], part: null,
    checks: [
      { id: "kitchen", what: "Kitchen counters, stove and sink clean", evidence: "photo", rule: "A photo shows clean, clear counters, stovetop and sink", show: "the counters clear and shiny, the stovetop free of grease, the sink empty and clean", bad: "grease on the stovetop and dirty dishes still in the sink" },
      { id: "bathroom", what: "Bathroom tub, toilet, sink and mirror clean", evidence: "photo", rule: "A photo shows the tub, toilet and sink clean and the mirror streak-free", show: "a clean white tub, a clean toilet, a streak-free mirror", bad: "soap scum around the tub and toothpaste spots on the mirror" },
      { id: "floors", what: "Floors vacuumed and mopped", evidence: "photo", rule: "A photo shows the living-room and kitchen floors clean", show: "the living-room floor vacuumed with clear lines in the rug, the kitchen floor freshly mopped", bad: "crumbs and dust bunnies along the living-room baseboards" },
      { id: "trash", what: "Trash taken out", evidence: "photo", rule: "A photo shows empty bins with new liners", show: "the kitchen and bathroom bins empty with new liners", bad: "an overflowing kitchen trash can" } ] },
  { id: "move_out_clean", trade: "cleaning", title: "Move-out clean including oven and fridge", ask: ["moving out Friday, need the place cleaned for my deposit", "move-out cleaning, oven and fridge included", "end-of-lease clean for a 2BR"],
    items: ["Clean inside the oven", "Clean inside the fridge", "Clean the bathrooms", "Vacuum and mop all floors"], labor: [220, 380], part: null,
    checks: [
      { id: "oven", what: "Inside of the oven clean", evidence: "photo", rule: "A photo of the open oven shows clean walls and racks", show: "the open oven with clean gray walls and shiny racks", bad: "the open oven with burnt-on grease on the bottom" },
      { id: "fridge", what: "Inside of the fridge empty and clean", evidence: "photo", rule: "A photo of the open fridge shows it empty with wiped shelves", show: "the open fridge empty, shelves wiped, drawers clean", bad: "the open fridge with old food and sticky stains on the shelves" },
      { id: "bathrooms", what: "Bathrooms clean", evidence: "photo", rule: "A photo shows each bathroom's tub, toilet and sink clean", show: "both bathrooms with clean tubs, toilets and sinks", bad: "one bathroom clean, the second still with a dirty tub" },
      { id: "floors", what: "Floors vacuumed and mopped", evidence: "photo", rule: "A photo shows clean floors in every room", show: "empty rooms with clean, mopped floors", bad: "dust and debris left in the corners of the bedroom" } ] },
  // ---- handyman
  { id: "tv_mount", trade: "handyman", title: "Mount a 55-inch TV on drywall", ask: ["need my 55 inch TV mounted on the living room wall", "mount a TV over the couch", "wall-mount a 55\" TV and hide the cables"],
    items: ["Mount the TV on studs with a tilting mount", "Make the TV level", "Hide the cables"], labor: [120, 220], part: { name: "tilting TV wall mount", price: [30, 70] },
    checks: [
      { id: "level", what: "TV mounted level", evidence: "photo", rule: "A photo shows a level on top of the TV with the bubble centered", show: "the mounted TV with a bubble level on top, the bubble centered", bad: "the mounted TV with a level on top, the bubble off to one side" },
      { id: "studs", what: "Mount anchored into studs", evidence: "note", rule: "The pro's note says the mount is lag-bolted into two studs, with the stud spacing", show: "mount lag-bolted into two studs at 16 in. on center, checked with a stud finder", bad: "used drywall anchors because the studs didn't line up" },
      { id: "cables", what: "Cables hidden", evidence: "photo", rule: "A photo shows no cables hanging below the TV", show: "the wall below the TV clean, the cables run through a cord cover", bad: "HDMI and power cables hanging loose below the TV" },
      { id: "parts_receipt", what: "Receipt for the mount", evidence: "receipt", rule: "A receipt lists the TV mount, is dated within the job window, and its total is within the parts allowance" } ] },
  { id: "furniture_assembly", trade: "handyman", title: "Assemble a dresser and a bed frame", ask: ["need someone to put together a dresser and a bed frame", "flat-pack furniture assembly, two pieces", "assemble my new IKEA-style dresser and bed"],
    items: ["Assemble the dresser", "Assemble the bed frame", "Remove the packaging"], labor: [100, 200], part: null,
    checks: [
      { id: "dresser", what: "Dresser assembled, drawers slide", evidence: "photo", rule: "A photo shows the assembled dresser with drawers in place", show: "the assembled dresser standing upright, all six drawers in and closed evenly", bad: "the dresser assembled but two drawers missing" },
      { id: "bed", what: "Bed frame assembled and stable", evidence: "photo", rule: "A photo shows the assembled bed frame with slats in", show: "the assembled bed frame with all slats in and the center support leg down", bad: "the bed frame with half the slats still in the box" },
      { id: "packaging", what: "Packaging removed", evidence: "photo", rule: "A photo shows the room clear of boxes and foam", show: "the room clear, boxes broken down and gone", bad: "a pile of cardboard and foam left in the corner" } ] },
  { id: "drywall_patch", trade: "handyman", title: "Patch and paint a hole in drywall", ask: ["there's a fist-size hole in my hallway drywall", "patch a hole in the wall and paint it", "doorknob punched through the wall, need it patched"],
    items: ["Patch the hole", "Sand smooth", "Paint to match"], labor: [110, 210], part: { name: "drywall patch kit and paint", price: [20, 55] },
    checks: [
      { id: "smooth", what: "Patch smooth and flush", evidence: "photo", rule: "A raking-light photo shows the patch flush with the wall", show: "the patched area under a side light, flush and smooth with no edges", bad: "the patch with a visible raised edge and sanding marks" },
      { id: "painted", what: "Painted to match", evidence: "photo", rule: "A photo shows the patch painted, no visible color difference", show: "the wall painted, the patch invisible from a few feet away", bad: "the patch primed white against the beige wall, not painted" },
      { id: "parts_receipt", what: "Receipt for the materials", evidence: "receipt", rule: "A receipt lists the patch kit or paint, is dated within the job window, and its total is within the parts allowance" } ] },
];

export const STREETS = ["Elm St", "S Congress Ave", "E 6th St", "Barton Springs Rd", "Burnet Rd", "Manor Rd", "W 35th St", "Riverside Dr", "S Lamar Blvd", "E Cesar Chavez St", "Guadalupe St", "Airport Blvd"];
export const ZIPS = ["78701", "78702", "78703", "78704", "78705", "78723", "78741", "78745", "78751", "78756"];
export const STORES = ["Brightway Home Center", "Northline Hardware", "Lone Star Plumbing Supply", "Capitol Hardware", "Austin Pro Supply"];
export const PROS = ["Ace Rivera Plumbing (demo)", "Clearflow Plumbing (demo)", "Sparkle Squad Cleaning (demo)", "Fixit Frank Handyman (demo)", "Hill Country Home Services (demo)"];

export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
export const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
