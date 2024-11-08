# XI. Complete Numerical Solution Method

## 1. Initialization

### 1.1 State Variables

For each zone i ∈ {1,...,N} and layer j ∈ {1,...,M}:

```
Tp[i,j][0] = Tp,initial
wp[i,j][0] = wp,initial
Ta[i][0] = Ta,initial
wa[i][0] = wa,initial
TCPI[0] = TCPIinitial
Pcool,actual[0] = 0
```

### 1.2 Time Step Selection

```
dt = min{
    L/(10v),                       # CFL condition
    min{mp,i,j * cp/(10h * A)},    # Thermal diffusion
    min{ma,i/(10ṁa)},              # Mass flow
    T_L/10                         # Control response
}
```

## 2. Time Integration Loop

For each time step n → n+1:

### 2.1 Begin Zone Loop

For each zone i ∈ {1,...,N}:

#### A. Zone-Level Flow Calculations

```
// Air properties at zone level
ρ[i] = P/(R * (Ta[i][n] + 273.15))
v[i] = ṁa/(ρ[i] * W * H)
Re[i] = (ρ[i] * v[i] * Dh)/μ
I[i] = 0.16 * (Re[i])^(-1/8)  // Turbulence intensity

// Initialize zone sums
Qp-a,total[i] = 0
mevap,total[i] = 0
```

#### B. Begin Layer Loop

For each layer j ∈ {1,...,M}:

```
// Layer-specific flow distribution
εj = εmax * (1 - α*exp(-β*h/H))
vi,j = v0 * g(h/H) * h(x/L)

// Heat transfer coefficients
h[i,j] = h0 * εj * TCPI[i] * (Re[i]/5000)^0.8
hm[i,j] = h[i,j]/(ρ[i] * cp,air) * Le^(2/3)  // Mass transfer coefficient

// Respiration heat
R[i,j] = rRef * exp(k * (Tp[i,j][n] - Tref))
Qresp[i,j] = R[i,j] * mp[i,j] * hResp

// Convective heat
Qconv[i,j] = h[i,j] * Ap[i,j] * (Tp[i,j][n] - Ta[i][n])
Qp-a,total[i] += Qconv[i,j]

// Evaporative cooling
psat[i,j] = 610.78 * exp((17.27 * Tp[i,j][n])/(Tp[i,j][n] + 237.3))
VPD[i,j] = psat[i,j] * aw - (wa[i][n] * P)/(0.622 + wa[i][n])
mevap[i,j] = (hm[i,j] * Ap[i,j] * fw * VPD[i,j])/(461.5 * (Tp[i,j][n] + 273.15))
mevap,total[i] += mevap[i,j]
Qevap[i,j] = mevap[i,j] * λ

// Calculate NTU for TCPI
NTU[i,j] = (h[i,j] * A[i,j])/(ṁa * cp,air)
η_cool[i,j] = h_eff[i,j]/h_ideal * (1 - exp(-NTU[i,j]))

// Update product state
dTp/dt[i,j] = (Qresp[i,j] - Qconv[i,j] - Qevap[i,j])/(mp[i,j] * cp)
dwp/dt[i,j] = -mevap[i,j]/mp[i,j]

Tp[i,j][n+1] = Tp[i,j][n] + dt * dTp/dt[i,j]
wp[i,j][n+1] = wp[i,j][n] + dt * dwp/dt[i,j]

// Apply product constraints
wp[i,j][n+1] = min(wp[i,j][n+1], wp,initial)
```

#### C. End Layer Loop, Resume Zone Level

```
// Calculate TCPI components
η̄_cool[i] = spatial_average(η_cool[i,:])
σ_η[i] = spatial_std_dev(η_cool[i,:])
E_factor[i] = (1 + β * I[i]²) * E_baseline
TCPI[i] = η̄_cool[i]/E_factor[i] * (1 - γ * σ_η[i]/η̄_cool[i])

// Apply TCPI constraints
TCPI[i] = max(TCPI_min, min(TCPI[i], 1.0))

// Cooling unit operations (first zone only)
if i == 1:
    Qcool,sensible = ṁa * cp,air * (Ta[1][n] - Tcoil)
    mdehum[1] = ṁa * (wa[1][n] - wsat(Tdp)) * σ((Ta[1][n] - Tdp)/0.2) *
                σ((wa[1][n] - wsat(Tdp))/0.00005)
    Qcool,latent = mdehum[1] * λ
    Qcool[1] = Qcool,sensible + Qcool,latent
    Pcool,actual = Pcool,rated * (Qcool[1]/Qcool,max)^(1/TCPI[1])
else:
    Qcool[i] = 0
    mdehum[i] = 0

// Wall heat transfer
Qwall[i] = calculate_wall_heat_transfer(i)

// Update air state
dTa/dt[i] = (ṁa * cp,air * (Ta[i-1][n] - Ta[i][n]) +
             Qp-a,total[i] + Qwall[i] - Qcool[i])/(ma[i] * cp,air)
dwa/dt[i] = (mevap,total[i] - mdehum[i] + mvent[i])/ma[i]

Ta[i][n+1] = Ta[i][n] + dt * dTa/dt[i]
wa[i][n+1] = wa[i][n] + dt * dwa/dt[i]

// Apply air constraints
wa[i][n+1] = min(wa[i][n+1], wsat(Ta[i][n+1]))
Ta[i][n+1] = max(Ta[i][n+1], Tdp)
```

### 2.2 End Zone Loop, Time Step Finalization

```
// Update control parameters
ṁa = ṁa,design * √(min(TCPI))

// Conservation verification
For each zone i:
    ΔE[i] = |Ein[i] - Eout[i] - ΔEstored[i]|
    ΔM[i] = |Min[i] - Mout[i] - ΔMstored[i]|
    if ΔE[i]/Ein[i] > tolerance or ΔM[i]/Min[i] > tolerance:
        raise ConservationError

// Performance metrics
For each zone i, layer j:
    CRI[i,j] = (Tp[i,j][n+1] - Ta[i][n+1])/(Tp,initial - Ta,supply)
    if CRI[i,j] crosses 0.125:
        SECT[i,j] = current_time

UI = std_dev(SECT)/mean(SECT)
COP = (Qcool,sensible + Qcool,latent)/Pcool,actual
moisture_efficiency = mdehum[1]/(sum(mevap,total) + mvent,total)

// Convergence check
converged = true
For each state variable X:
    if |X[n+1] - X[n]| >= tolerance:
        converged = false
        break

if converged and time > min_simulation_time:
    simulation_complete = true
```
